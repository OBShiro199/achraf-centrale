-- Signup abuse limits (PRD: security). The signup function checks here before creating an account and records
-- each one after. IP addresses are stored only as salted hashes, and rows older than 30 days are cleared.

create table if not exists private.signup_log (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  email text not null,
  created_at timestamptz not null default now()
);
create index if not exists signup_log_ip on private.signup_log (ip_hash, created_at desc);
alter table private.signup_log enable row level security;
revoke all on private.signup_log from anon, authenticated;

/** Accounts one network can open in a day. Tester addresses are not counted against it. */
create or replace function public.signup_check(p_ip_hash text, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_tester_email(p_email) then return null; end if;
  if (select count(*) from private.signup_log s where s.ip_hash = p_ip_hash and s.created_at > now() - interval '24 hours'
      and not private.is_tester_email(s.email)) >= 3 then
    return 'Too many accounts have been opened from this network today. Try again tomorrow, or write to us.';
  end if;
  return null;
end;
$$;

create or replace function public.signup_record(p_ip_hash text, p_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.signup_log where created_at < now() - interval '30 days';
  insert into private.signup_log (ip_hash, email) values (p_ip_hash, lower(p_email));
$$;

revoke all on function public.signup_check(text, text) from public, anon, authenticated;
revoke all on function public.signup_record(text, text) from public, anon, authenticated;
grant execute on function public.signup_check(text, text) to service_role;
grant execute on function public.signup_record(text, text) to service_role;
