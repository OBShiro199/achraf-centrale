-- Pricing for launch: two plans, $129 a month or $249 every 3 months, both after a 7-day trial with a card.
-- The trial gets everything the plan has: entitlements report paid = true during a running trial, so reveals,
-- exports, unmasked contacts and sending all work, and founders are moving by the time it ends. Whop plan ids are filled in once the plans exist in Whop (see docs/HANDOVER.md).

alter table public.plans add column if not exists period_months integer not null default 1;

update public.plans set name = 'Monthly', price = 129, currency = 'usd', period_months = 1, active = true, sort_order = 1 where id = 'monthly';

insert into public.plans (id, name, price_gbp, currency, price, period_months, whop_plan_id, trial_days, max_rows, page_size_max,
  reveals_per_period, export_credits_per_period, daily_row_views, searches_per_minute, sort_order, active, deck_runs_per_period)
select 'quarterly', 'Quarterly', 0, 'usd', 249, 3, null, 7, max_rows, page_size_max,
  reveals_per_period, export_credits_per_period, daily_row_views, searches_per_minute, 2, true, deck_runs_per_period
from public.plans where id = 'monthly'
on conflict (id) do update set name = excluded.name, price = excluded.price, period_months = excluded.period_months, active = true;

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
    case when e.paid or e.in_trial then p.reveals_per_period else 0 end,
    case when e.paid or e.in_trial then greatest(0, p.reveals_per_period - (
      select count(*) from public.investor_unlocks u where u.owner_id = p_uid and u.source = 'reveal' and u.created_at >= e.ps
    ))::int else 0 end,
    case when e.paid or e.in_trial then p.export_credits_per_period else 0 end,
    case when e.paid or e.in_trial then greatest(0, p.export_credits_per_period - coalesce((
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
