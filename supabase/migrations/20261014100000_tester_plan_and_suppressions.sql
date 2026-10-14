-- 1. Tester accounts get their own plan: sending (still redirected to the test inbox), decks and search, but no
--    contact reveals or exports. Signup does not verify email addresses yet, so a tester address must never be a
--    route to investor contact data.
-- 2. A global "do not email" list. Every first email and follow-up checks it before sending; unsubscribe links
--    and OpenMail bounce or complaint refusals add to it.

insert into public.plans (id, name, price_gbp, trial_days, max_rows, page_size_max, reveals_per_period, export_credits_per_period,
  daily_row_views, searches_per_minute, sort_order, currency, price, active, deck_runs_per_period)
values ('tester', 'Tester', 0, 0, 500, 100, 0, 0, 5000, 60, 9, 'usd', 0, false, 5)
on conflict (id) do update set reveals_per_period = 0, export_credits_per_period = 0, max_rows = 500, deck_runs_per_period = 5, active = false;

create or replace function private.start_trial()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.is_tester_email(new.email) then
    insert into public.subscriptions (owner_id, plan_id, status, current_period_start, current_period_end)
    values (new.id, 'tester', 'active', now(), now() + interval '30 days')
    on conflict (owner_id) do nothing;
    update public.profiles set is_staff = true where id = new.id;
  else
    insert into public.subscriptions (owner_id, plan_id, status)
    values (new.id, 'trial', 'pending')
    on conflict (owner_id) do nothing;
  end if;
  return new;
end;
$$;

-- Accounts that got the full plan through the tester path (no Whop membership) move to the tester plan.
update public.subscriptions s set plan_id = 'tester'
from public.profiles p
where p.id = s.owner_id and private.is_tester_email(p.email) and s.plan_id = 'monthly' and s.status = 'active'
  and s.whop_membership_id is null and s.whop_checkout_id is null;

-- Reveals: a plan with no reveals says so plainly instead of "used all 0".
do $$
declare def text;
begin
  select pg_get_functiondef('public.reveal_investor(bigint)'::regprocedure) into def;
  def := replace(def,
    $a$    if e.reveals_left <= 0 then$a$,
    $b$    if e.reveals_total = 0 then
      raise exception 'trial_locked: Contact details are not included in this plan.' using errcode = 'P0001';
    end if;
    if e.reveals_left <= 0 then$b$);
  execute def;
end $$;

create table if not exists public.email_suppressions (
  email text primary key check (email = lower(email)),
  reason text not null check (reason in ('unsubscribe', 'bounce', 'complaint', 'manual')),
  investor_id bigint references public.investors_achraf(id) on delete set null,
  outreach_message_id uuid references public.outreach_messages(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
revoke all on public.email_suppressions from anon, authenticated;

-- Staff can see the list; founders cannot.
drop policy if exists "staff read suppressions" on public.email_suppressions;
create policy "staff read suppressions" on public.email_suppressions for select to authenticated using (private.is_staff((select auth.uid())));
grant select on public.email_suppressions to authenticated;
