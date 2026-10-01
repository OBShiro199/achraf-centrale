-- Billing moves to Whop with one plan ($149 a month) and a 7-day trial that needs a card up front.
--
--   pending   account created, no card yet. The app sends them to Whop checkout before onboarding.
--   trialing  card on file, 7 days. Profile, scrape, deck and a browsable directory with contacts
--             truncated. No inbox, no sending, no reveals, no exports.
--   active    paid. Inbox created, everything unlocked at the monthly plan's limits.
-- Whop is the source of truth; the whop-webhook function keeps public.subscriptions in step.

-- 1. Plans -------------------------------------------------------------------------------------
alter table public.plans
  add column currency text not null default 'gbp',
  add column price numeric,
  add column whop_plan_id text unique,
  add column active boolean not null default true;

update public.plans set active = false where id in ('starter', 'pro');
update public.plans set reveals_per_period = 0, export_credits_per_period = 0, max_rows = 500 where id = 'trial';

insert into public.plans (
  id, name, price_gbp, currency, price, whop_plan_id, trial_days, max_rows, page_size_max,
  reveals_per_period, export_credits_per_period, daily_row_views, searches_per_minute, sort_order
) values ('monthly', 'Centrale', 0, 'usd', 149, 'plan_EtTE02V8ronH4', 7, null, 100, 2500, 2500, 50000, 120, 1);

-- 2. Subscriptions -----------------------------------------------------------------------------
alter table public.subscriptions drop constraint subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('pending', 'trialing', 'active', 'past_due', 'canceled', 'expired'));
alter table public.subscriptions alter column status set default 'pending';
alter table public.subscriptions
  add column whop_membership_id text unique,
  add column whop_user_id text,
  add column whop_checkout_id text,
  add column manage_url text;

-- New accounts wait for checkout instead of starting a trial on their own.
create or replace function private.start_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions (owner_id, plan_id, status)
  values (new.id, 'trial', 'pending')
  on conflict (owner_id) do nothing;
  return new;
end;
$$;

-- 3. Entitlements ------------------------------------------------------------------------------
drop function if exists private.entitlements(uuid);
create or replace function private.entitlements(p_uid uuid)
returns table (
  plan_id text, plan_name text, status text, active boolean, paid boolean, trial_ends_at timestamptz,
  period_start timestamptz, period_end timestamptz, max_rows integer, page_size_max integer,
  reveals_total integer, reveals_left integer, exports_total integer, exports_left integer,
  daily_row_views integer, rows_viewed_today integer, searches_per_minute integer, can_send boolean, manage_url text
)
language sql
stable
security definer
set search_path = ''
as $$
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
      -- A day of grace past the trial end covers a late renewal webhook.
      s.status = 'trialing' and coalesce(s.trial_ends_at, now()) > now() - interval '1 day' as in_trial
    from s
  ),
  e as (select a.*, case when a.paid then a.plan_id else 'trial' end as limits_plan from a)
  select
    e.plan_id,
    p.name,
    case when e.paid or e.in_trial then e.status when e.status = 'pending' then 'pending' else 'expired' end,
    e.paid or e.in_trial,
    e.paid,
    e.trial_ends_at,
    e.ps,
    e.pe,
    case when e.paid or e.in_trial then p.max_rows else 100 end,
    p.page_size_max,
    case when e.paid then p.reveals_per_period else 0 end,
    case when e.paid then greatest(0, p.reveals_per_period - (
      select count(*) from public.investor_unlocks u where u.owner_id = p_uid and u.source = 'reveal' and u.created_at >= e.ps
    ))::int else 0 end,
    case when e.paid then p.export_credits_per_period else 0 end,
    case when e.paid then greatest(0, p.export_credits_per_period - coalesce((
      select sum(x.credits) from public.export_log x where x.owner_id = p_uid and x.created_at >= e.ps
    ), 0))::int else 0 end,
    case when e.paid or e.in_trial then p.daily_row_views else 300 end,
    coalesce((select u.rows_viewed from private.search_usage u where u.owner_id = p_uid and u.day = current_date), 0),
    p.searches_per_minute,
    e.paid,
    e.manage_url
  from e
  join public.plans p on p.id = e.limits_plan;
$$;
revoke all on function private.entitlements(uuid) from public, anon, authenticated;

-- Whether the signed-in founder can send email, for row-level checks and the app.
create or replace function public.can_send_email()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select e.can_send from private.entitlements(auth.uid()) e), false);
$$;
revoke all on function public.can_send_email() from public, anon;
grant execute on function public.can_send_email() to authenticated;

-- 4. Truncated contact details during the trial --------------------------------------------------
-- "+1 201-307-4934" becomes "+1 201-•••-••••": country and area code stay, the rest is hidden.
create or replace function private.mask_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null then null
    when position(' ' in p) > 0 then left(p, 7) || regexp_replace(substr(p, 8), '[0-9]', '•', 'g')
    else left(p, 5) || regexp_replace(substr(p, 6), '[0-9]', '•', 'g')
  end;
$$;

do $do$
declare def text;
begin
  select pg_get_functiondef('private.search_page(jsonb, text, text, integer, integer, uuid, boolean)'::regprocedure) into def;
  def := replace(def, $a$'phone', case when $7 or pg.unlocked or i.source <> 'contacts' then i.phone end,$a$,
                      $b$'phone', case when $7 or pg.unlocked or i.source <> 'contacts' then i.phone else private.mask_phone(i.phone) end,$b$);
  def := replace(def, $a$'mobile', case when $7 or pg.unlocked or i.source <> 'contacts' then i.mobile end,$a$,
                      $b$'mobile', case when $7 or pg.unlocked or i.source <> 'contacts' then i.mobile else private.mask_phone(i.mobile) end,$b$);
  def := replace(def, $a$'direct_phone', case when $7 or pg.unlocked or i.source <> 'contacts' then i.direct_phone end,$a$,
                      $b$'direct_phone', case when $7 or pg.unlocked or i.source <> 'contacts' then i.direct_phone else private.mask_phone(i.direct_phone) end,$b$);
  if position('private.mask_phone(i.direct_phone)' in def) = 0 then raise exception 'search_page rewrite did not apply'; end if;
  execute def;

  select pg_get_functiondef('public.investor_detail(uuid)'::regprocedure) into def;
  def := replace(def, $a$    ) else null end$a$, $b$    ) else jsonb_build_object(
      'email', private.mask_email(i.email), 'phone', private.mask_phone(i.phone), 'mobile', private.mask_phone(i.mobile),
      'direct_phone', private.mask_phone(i.direct_phone), 'linkedin_url', null, 'twitter_url', null
    ) end$b$);
  if position('private.mask_phone(i.mobile)' in def) = 0 then raise exception 'investor_detail rewrite did not apply'; end if;
  execute def;

  -- Reveals need a paid plan.
  select pg_get_functiondef('public.reveal_investor(uuid)'::regprocedure) into def;
  def := replace(def, $a$    if e.reveals_left <= 0 then$a$, $b$    if not e.paid then
      raise exception 'trial_locked: Contact details unlock when your plan starts, after the 7-day trial.' using errcode = 'P0001';
    end if;
    if e.reveals_left <= 0 then$b$);
  if position('trial_locked' in def) = 0 then raise exception 'reveal rewrite did not apply'; end if;
  execute def;

  -- Follow-ups are only planned for paying founders.
  select pg_get_functiondef('public.follow_up_candidates(integer)'::regprocedure) into def;
  def := replace(def, '    and s.auto_follow_up', E'    and s.auto_follow_up\n    and exists (select 1 from public.subscriptions sub where sub.owner_id = o.owner_id and sub.status in (''active'', ''past_due''))');
  if position('sub.status in' in def) = 0 then raise exception 'follow_up rewrite did not apply'; end if;
  execute def;
end $do$;
revoke all on function public.follow_up_candidates(integer) from public, anon, authenticated;
grant execute on function public.follow_up_candidates(integer) to service_role;

-- 5. Queueing email needs a paid plan ------------------------------------------------------------
drop policy "own scheduled insert" on public.scheduled_emails;
create policy "own scheduled insert" on public.scheduled_emails
  for insert to authenticated
  with check ((select auth.uid()) = owner_id and kind = 'first' and status = 'queued' and (select public.can_send_email()));
