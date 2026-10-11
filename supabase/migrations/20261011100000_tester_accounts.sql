-- Tester accounts: emails on this list start on the full plan at signup (no Whop checkout, no 7-day wait to
-- send) and see running costs, so the whole flow can be tested end to end with one Gmail inbox using
-- plus addresses (oliverburt3+anything@gmail.com). Outreach still goes to the test recipient while
-- OUTREACH_LIVE is off.

create table if not exists private.tester_emails (
  pattern text primary key,  -- matched with ILIKE, e.g. 'oliverburt3+%@gmail.com'
  note text
);
alter table private.tester_emails enable row level security;
revoke all on private.tester_emails from anon, authenticated;

insert into private.tester_emails (pattern, note) values
  ('oliverburt3@gmail.com', 'Oliver'),
  ('oliverburt3+%@gmail.com', 'Oliver, plus addresses')
on conflict (pattern) do nothing;

create or replace function private.is_tester_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.tester_emails t where lower(coalesce(p_email, '')) like lower(t.pattern));
$$;

create or replace function private.start_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_tester_email(new.email) then
    insert into public.subscriptions (owner_id, plan_id, status, current_period_start, current_period_end)
    values (new.id, 'monthly', 'active', now(), now() + interval '30 days')
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
