-- Investor removal requests (PRD launch blocker 8). An investor asks at /remove with their email, confirms
-- from a link sent to that address, and is then taken out of search, profiles, reveals, exports and sending.
-- The source row in investors_achraf stays for audit; staff erase it by hand if the request asks for erasure.

-- Lookups by email (removals, webhooks) without scanning 335k rows.
create index if not exists investors_achraf_email_lower on public.investors_achraf (lower(email)) where email is not null and email <> '';

-- Pending requests: one token per email, valid 48 hours. Service role only.
create table if not exists private.removal_requests (
  token uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists removal_requests_email on private.removal_requests (email, created_at desc);
alter table private.removal_requests enable row level security;
revoke all on private.removal_requests from anon, authenticated;

-- Confirmed removals. Directory rebuilds and imports must skip these ids.
create table if not exists private.investor_removals (
  investor_id bigint primary key,
  email text not null,
  removed_at timestamptz not null default now()
);
alter table private.investor_removals enable row level security;
revoke all on private.investor_removals from anon, authenticated;

alter table public.email_suppressions drop constraint if exists email_suppressions_reason_check;
alter table public.email_suppressions add constraint email_suppressions_reason_check
  check (reason in ('unsubscribe', 'bounce', 'complaint', 'manual', 'removal'));

-- Starts a request. Returns a token to email, or null when there is nothing to remove or a link went out in
-- the last 15 minutes (the caller answers the same either way, so the page reveals nothing).
create or replace function public.request_investor_removal(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  em text := lower(trim(coalesce(p_email, '')));
  t uuid;
begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return null; end if;
  if not exists (select 1 from public.investors_achraf a where lower(a.email) = em and a.email <> '') then return null; end if;
  if exists (select 1 from private.removal_requests r where r.email = em and r.created_at > now() - interval '15 minutes') then return null; end if;
  insert into private.removal_requests (email) values (em) returning token into t;
  return t;
end;
$$;
revoke all on function public.request_investor_removal(text) from public, anon, authenticated;
grant execute on function public.request_investor_removal(text) to service_role;

-- Confirms a request: hides every directory row with that email, adds the address to the do-not-email list
-- and cancels anything queued to it. Returns how many directory rows were removed, or null if the link is
-- unknown or older than 48 hours.
create or replace function public.confirm_investor_removal(p_token uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r private.removal_requests;
  ids bigint[];
begin
  select * into r from private.removal_requests x where x.token = p_token;
  if r.token is null or r.created_at < now() - interval '48 hours' then return null; end if;

  select coalesce(array_agg(a.id), '{}') into ids from public.investors_achraf a where lower(a.email) = r.email and a.email <> '';
  insert into private.investor_removals (investor_id, email) select unnest(ids), r.email on conflict do nothing;
  delete from private.lead_search where id = any (ids);
  delete from private.lead_text where id = any (ids);
  insert into public.email_suppressions (email, reason, investor_id) values (r.email, 'removal', ids[1])
    on conflict (email) do update set reason = 'removal';
  update public.scheduled_emails set status = 'cancelled', last_error = 'Investor asked to be removed'
    where status = 'queued' and investor_id = any (ids);
  update private.removal_requests set confirmed_at = coalesce(confirmed_at, now()) where token = p_token;
  return cardinality(ids);
end;
$$;
revoke all on function public.confirm_investor_removal(uuid) from public, anon, authenticated;
grant execute on function public.confirm_investor_removal(uuid) to service_role;

-- Profiles and reveals treat removed investors as gone, for founders who saved them earlier.
do $$
declare
  fn text;
  def text;
  patched text;
begin
  foreach fn in array array['public.investor_detail(bigint)', 'public.reveal_investor(bigint)'] loop
    select pg_get_functiondef(fn::regprocedure) into def;
    patched := replace(def,
      $a$if a.id is null then raise exception 'not_found:$a$,
      $b$if a.id is null or exists (select 1 from private.investor_removals r where r.investor_id = p_id) then raise exception 'not_found:$b$);
    if patched = def then raise exception 'Could not patch %', fn; end if;
    execute patched;
  end loop;
end $$;
