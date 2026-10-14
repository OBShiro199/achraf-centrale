-- Admin console actions (staff only): change a founder's plan, pause or resume their inbox, and add or lift a
-- manual block on an address. Every action is written to private.admin_actions with who did it.
-- Whop stays the source of truth for paid plans: its next webhook for that founder overwrites a manual change.

create table if not exists private.admin_actions (
  id bigint generated always as identity primary key,
  actor uuid not null,
  action text not null,
  target text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table private.admin_actions enable row level security;
revoke all on private.admin_actions from anon, authenticated;

create or replace function private.require_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff(auth.uid()) then
    raise exception 'staff_only: Only the Centrale team can do this.' using errcode = 'P0001';
  end if;
  return auth.uid();
end;
$$;

create or replace function private.founder_id(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  select id into uid from public.profiles where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'not_found: No founder has the login email %.', p_email using errcode = 'P0001'; end if;
  return uid;
end;
$$;

create or replace function public.admin_set_plan(p_email text, p_plan text, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_staff();
  uid uuid := private.founder_id(p_email);
begin
  if not exists (select 1 from public.plans where id = p_plan) then
    raise exception 'bad_plan: There is no plan called %.', p_plan using errcode = 'P0001';
  end if;
  if p_status not in ('trialing', 'active', 'past_due', 'canceled', 'expired') then
    raise exception 'bad_status: Unknown status %.', p_status using errcode = 'P0001';
  end if;
  insert into public.subscriptions (owner_id, plan_id, status, current_period_start, current_period_end)
  values (uid, p_plan, p_status, now(), now() + interval '30 days')
  on conflict (owner_id) do update set plan_id = excluded.plan_id, status = excluded.status,
    current_period_start = case when public.subscriptions.status <> excluded.status then now() else public.subscriptions.current_period_start end,
    current_period_end = case when public.subscriptions.status <> excluded.status then now() + interval '30 days' else public.subscriptions.current_period_end end;
  insert into private.admin_actions (actor, action, target, detail)
  values (actor, 'set_plan', lower(p_email), jsonb_build_object('plan', p_plan, 'status', p_status));
end;
$$;

-- Paused inboxes keep their queue; the Outbox holds it until the inbox is resumed.
create or replace function public.admin_set_inbox(p_email text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_staff();
  uid uuid := private.founder_id(p_email);
  n integer;
begin
  update public.inboxes set status = case when p_active then 'active' else 'suspended' end
  where owner_id = uid and status in ('active', 'suspended');
  get diagnostics n = row_count;
  if n = 0 then raise exception 'no_inbox: This founder has no inbox yet.' using errcode = 'P0001'; end if;
  insert into private.admin_actions (actor, action, target, detail)
  values (actor, case when p_active then 'resume_inbox' else 'pause_inbox' end, lower(p_email), null);
end;
$$;

-- Manual blocks only. Bounces, complaints, unsubscribes and removals cannot be lifted here.
create or replace function public.admin_block_address(p_email text, p_block boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_staff();
  em text := lower(trim(p_email));
begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email: Enter an email address.' using errcode = 'P0001'; end if;
  if p_block then
    insert into public.email_suppressions (email, reason) values (em, 'manual') on conflict (email) do nothing;
    update public.scheduled_emails e set status = 'cancelled', last_error = 'Blocked by the Centrale team'
    from public.investors_achraf a
    where e.status = 'queued' and a.id = e.investor_id and lower(a.email) = em;
  else
    if exists (select 1 from public.email_suppressions where email = em and reason <> 'manual') then
      raise exception 'not_manual: This address bounced, complained, unsubscribed or asked to be removed, so it stays blocked.' using errcode = 'P0001';
    end if;
    delete from public.email_suppressions where email = em and reason = 'manual';
  end if;
  insert into private.admin_actions (actor, action, target, detail)
  values (actor, case when p_block then 'block_address' else 'unblock_address' end, em, null);
end;
$$;

-- The latest actions, for the console.
create or replace function public.admin_recent_actions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.is_staff(auth.uid()) then coalesce((
    select jsonb_agg(jsonb_build_object('at', a.created_at, 'by', p.email, 'action', a.action, 'target', a.target, 'detail', a.detail) order by a.created_at desc)
    from (select * from private.admin_actions order by created_at desc limit 30) a
    left join public.profiles p on p.id = a.actor
  ), '[]') end;
$$;

revoke all on function public.admin_set_plan(text, text, text), public.admin_set_inbox(text, boolean),
  public.admin_block_address(text, boolean), public.admin_recent_actions() from public, anon;
grant execute on function public.admin_set_plan(text, text, text), public.admin_set_inbox(text, boolean),
  public.admin_block_address(text, boolean), public.admin_recent_actions() to authenticated;
revoke all on function private.require_staff(), private.founder_id(text) from public, anon, authenticated;
