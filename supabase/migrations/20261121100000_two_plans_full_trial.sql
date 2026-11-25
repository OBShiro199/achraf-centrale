-- Pricing for launch: two plans, $129 a month or $249 every 3 months, both after a 7-day trial with a card.
-- The trial gets everything the plan has: entitlements report paid = true during a running trial, so reveals,
-- exports, unmasked contacts and sending all work, and founders are moving by the time it ends. Whop plan ids are filled in once the plans exist in Whop (see docs/HANDOVER.md).

alter table public.plans add column if not exists period_months integer not null default 1;

-- The monthly row's Whop plan was the $1 test plan: cleared so nobody is charged $1 while the page says $129.
-- Fill in both ids from the new Whop plans straight after applying this (docs/HANDOVER.md section 6). A plan
-- without a Whop id is hidden from the plan picker and refused at checkout.
update public.plans set name = 'Monthly', price = 129, currency = 'usd', period_months = 1, active = true, sort_order = 1, whop_plan_id = null where id = 'monthly';

insert into public.plans (id, name, price_gbp, currency, price, period_months, whop_plan_id, trial_days, max_rows, page_size_max,
  reveals_per_period, export_credits_per_period, daily_row_views, searches_per_minute, sort_order, active, deck_runs_per_period)
select 'quarterly', 'Quarterly', 0, 'usd', 249, 3, null, 7, max_rows, page_size_max,
  -- Allowances reset each billing period, so a quarter gets three months' worth.
  reveals_per_period * 3, export_credits_per_period * 3, daily_row_views, searches_per_minute, 2, true, deck_runs_per_period
from public.plans where id = 'monthly'
on conflict (id) do update set name = excluded.name, price = excluded.price, period_months = excluded.period_months,
  reveals_per_period = excluded.reveals_per_period, export_credits_per_period = excluded.export_credits_per_period, active = true;

-- During the trial, contact reveals and export credits are capped at this many, so a trial cannot copy the
-- directory and cancel. Everything else in the trial matches the plan.
create or replace function private.trial_contact_cap()
returns integer
language sql
immutable
set search_path = ''
as $$ select 100 $$;

create or replace function private.entitlements(p_uid uuid)
 RETURNS TABLE(plan_id text, plan_name text, status text, active boolean, paid boolean, trial_ends_at timestamp with time zone, period_start timestamp with time zone, period_end timestamp with time zone, max_rows integer, page_size_max integer, reveals_total integer, reveals_left integer, exports_total integer, exports_left integer, daily_row_views integer, rows_viewed_today integer, searches_per_minute integer, can_send boolean, manage_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with s as (
    select
      coalesce(sub.plan_id, 'trial') as plan_id,
      coalesce(sub.status, 'pending') as status,
      sub.trial_ends_at,
      coalesce(sub.current_period_start, now()) as ps,
      sub.current_period_end as pe,
      sub.manage_url
    from (select 1) one
    left join public.subscriptions sub on sub.owner_id = p_uid
  ),
  a as (
    select s.*,
      s.status in ('active', 'past_due') as paid,
      s.status = 'trialing' and coalesce(s.trial_ends_at, now()) > now() - interval '1 day' as in_trial
    from s
  ),
  e as (select a.*, case when (a.paid or a.in_trial) and a.plan_id <> 'trial' then a.plan_id else 'trial' end as limits_plan from a)
  select
    e.plan_id,
    p.name,
    case when e.paid or e.in_trial then e.status when e.status = 'pending' then 'pending' else 'expired' end,
    e.paid or e.in_trial,
    e.paid or e.in_trial,
    e.trial_ends_at,
    e.ps,
    e.pe,
    case when e.paid or e.in_trial then p.max_rows else 100 end,
    p.page_size_max,
    case when e.paid then p.reveals_per_period when e.in_trial then least(p.reveals_per_period, private.trial_contact_cap()) else 0 end,
    case when e.paid or e.in_trial then greatest(0, (case when e.paid then p.reveals_per_period else least(p.reveals_per_period, private.trial_contact_cap()) end) - (
      select count(*) from public.investor_unlocks u where u.owner_id = p_uid and u.source = 'reveal' and u.created_at >= e.ps
    ))::int else 0 end,
    case when e.paid then p.export_credits_per_period when e.in_trial then least(p.export_credits_per_period, private.trial_contact_cap()) else 0 end,
    case when e.paid or e.in_trial then greatest(0, (case when e.paid then p.export_credits_per_period else least(p.export_credits_per_period, private.trial_contact_cap()) end) - coalesce((
      select sum(x.credits) from public.export_log x where x.owner_id = p_uid and x.created_at >= e.ps
    ), 0))::int else 0 end,
    case when e.paid or e.in_trial then p.daily_row_views else 300 end,
    coalesce((select u.rows_viewed from private.search_usage u where u.owner_id = p_uid and u.day = current_date), 0),
    p.searches_per_minute,
    e.paid or e.in_trial,
    e.manage_url
  from e
  join public.plans p on p.id = e.limits_plan;
$function$;
revoke all on function private.entitlements(uuid) from public, anon, authenticated;
