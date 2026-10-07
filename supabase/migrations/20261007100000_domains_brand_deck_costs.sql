-- Custom sending domains, brand capture, researched decks with cost tracking and limits,
-- inboxes during the trial, and a service-only way to set Vault secrets.

-- ------------------------------------------------------------------------------------------
-- Secrets: the service role (edge functions) can create or replace a Vault secret.

create or replace function public.set_app_secret(secret_name text, secret_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  select id into existing from vault.secrets where name = secret_name limit 1;
  if existing is null then
    perform vault.create_secret(secret_value, secret_name);
  else
    perform vault.update_secret(existing, secret_value);
  end if;
end;
$$;
revoke all on function public.set_app_secret(text, text) from public, anon, authenticated;
grant execute on function public.set_app_secret(text, text) to service_role;

-- ------------------------------------------------------------------------------------------
-- Staff see running costs.

alter table public.profiles add column if not exists is_staff boolean not null default false;
update public.profiles set is_staff = true where email ilike 'oliverburt3%@gmail.com' or email = 'oburt5669@gmail.com';

-- Founders can only update first_name and last_name (column grants), and cannot insert profiles, so is_staff stays server-side.

create or replace function private.is_staff(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_staff from public.profiles where id = p_uid), false);
$$;

-- ------------------------------------------------------------------------------------------
-- Custom sending domains (OpenMail), one per founder.

create table if not exists public.sending_domains (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  domain text not null unique,
  openmail_domain_id text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'verifying', 'verified', 'failed', 'under_review', 'removed')),
  records jsonb not null default '[]',
  warnings jsonb not null default '[]',
  message text,
  verified_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sending_domains_one_live_per_owner
  on public.sending_domains (owner_id) where status <> 'removed';
alter table public.sending_domains enable row level security;
drop policy if exists "own domains read" on public.sending_domains;
create policy "own domains read" on public.sending_domains for select to authenticated using (owner_id = (select auth.uid()));

alter table public.inboxes add column if not exists domain text;
alter table public.inboxes add column if not exists retired_at timestamptz;

-- ------------------------------------------------------------------------------------------
-- Brand captured from the founder's homepage, and deck progress.

alter table public.startups add column if not exists brand jsonb;
alter table public.startups add column if not exists brand_status text;
alter table public.startups add column if not exists deck_stage text;
alter table public.startups add column if not exists deck_research jsonb;
alter table public.startups add column if not exists deck_started_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/gif'])
on conflict (id) do update set public = true;

-- ------------------------------------------------------------------------------------------
-- What the AI and scraping work costs, per call. Staff can read it; founders cannot.

create table if not exists public.ai_spend (
  id bigint generated always as identity primary key,
  owner_id uuid references auth.users(id) on delete set null,
  feature text not null,
  ref_id uuid,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  web_searches int not null default 0,
  firecrawl_credits int not null default 0,
  usd numeric(10, 4) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_spend_owner_created on public.ai_spend (owner_id, created_at desc);
create index if not exists ai_spend_ref on public.ai_spend (ref_id);
alter table public.ai_spend enable row level security;
drop policy if exists "staff read spend" on public.ai_spend;
create policy "staff read spend" on public.ai_spend for select to authenticated using (private.is_staff((select auth.uid())));

-- One row per deck generation: drives the limit and the per-deck cost.
create table if not exists public.deck_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  stage text,
  error text,
  usd numeric(10, 4) not null default 0,
  sources int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists deck_runs_owner_started on public.deck_runs (owner_id, started_at desc);
alter table public.deck_runs enable row level security;
drop policy if exists "own deck runs read" on public.deck_runs;
create policy "own deck runs read" on public.deck_runs for select to authenticated using (owner_id = (select auth.uid()));
-- Founders see their own runs but not what they cost.
revoke select on public.deck_runs from authenticated;
grant select (id, owner_id, status, stage, error, sources, started_at, finished_at) on public.deck_runs to authenticated;

-- ------------------------------------------------------------------------------------------
-- Deck generation limits.

alter table public.plans add column if not exists deck_runs_per_period int not null default 3;
update public.plans set deck_runs_per_period = 3 where id = 'trial';
update public.plans set deck_runs_per_period = 20 where id = 'monthly';

-- Deck generations used and allowed in the last 30 days.
create or replace function private.deck_allowance(p_uid uuid)
returns table (used int, total int, next_free_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with e as (select * from private.entitlements(p_uid)),
  r as (
    select count(*)::int as used, min(started_at) as oldest
    from public.deck_runs
    where owner_id = p_uid and started_at > now() - interval '30 days' and status <> 'error'
  )
  select r.used,
    case when e.active then p.deck_runs_per_period else 0 end,
    case when r.oldest is null then null else r.oldest + interval '30 days' end
  from e, r
  join public.plans p on true
  where p.id = case when e.paid then e.plan_id else 'trial' end;
$$;

create or replace function public.deck_allowance()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(a) from private.deck_allowance(auth.uid()) a;
$$;
revoke all on function public.deck_allowance() from public, anon;
grant execute on function public.deck_allowance() to authenticated;

-- Staff only: running costs over the last 30 days, by feature.
create or replace function public.spend_summary(p_days int default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.is_staff(auth.uid()) then (
    select jsonb_build_object(
      'total_usd', coalesce(sum(usd), 0),
      'by_feature', coalesce((
        select jsonb_agg(jsonb_build_object('feature', feature, 'usd', usd, 'calls', calls) order by usd desc)
        from (select feature, sum(usd) usd, count(*) calls from public.ai_spend
              where created_at > now() - make_interval(days => p_days) group by feature) f
      ), '[]'),
      'decks', (select jsonb_build_object('count', count(*), 'avg_usd', coalesce(avg(usd), 0), 'max_usd', coalesce(max(usd), 0))
                from public.deck_runs where status = 'done' and started_at > now() - make_interval(days => p_days))
    ) from public.ai_spend where created_at > now() - make_interval(days => p_days)
  ) end;
$$;
revoke all on function public.spend_summary(int) from public, anon;
grant execute on function public.spend_summary(int) to authenticated;

-- Staff only: what one founder's latest deck cost.
create or replace function public.deck_run_costs(p_limit int default 10)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.is_staff(auth.uid()) then coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'usd', usd, 'sources', sources, 'started_at', started_at) order by started_at desc)
    from (select * from public.deck_runs where owner_id = auth.uid() order by started_at desc limit p_limit) d
  ), '[]') end;
$$;
revoke all on function public.deck_run_costs(int) from public, anon;
grant execute on function public.deck_run_costs(int) to authenticated;
