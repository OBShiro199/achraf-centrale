-- Core schema: founders, startups, inboxes, investors, outreach.

create extension if not exists pgcrypto;
create schema if not exists private;

-- updated_at helper ------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- startups (one per founder for the MVP) ---------------------------------------
create table public.startups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text,
  domain text,
  website_url text,
  favicon_url text,
  one_liner text,
  summary text,
  mission text,
  goal text,
  sectors text[] not null default '{}',
  keywords text[] not null default '{}',
  business_model text,
  target_customer text,
  headcount text,
  "values" text[] not null default '{}',
  stage text,
  investor_types text[] not null default '{}',
  revenue_band text,
  raise_amount text,
  location text,
  traction text,
  deck_path text,
  deck_filename text,
  deck_mime text,
  deck_uploaded_at timestamptz,
  wants_generated_deck boolean not null default false,
  scrape jsonb,
  analysis jsonb,
  analysis_status text not null default 'idle'
    check (analysis_status in ('idle', 'running', 'done', 'error')),
  analysis_error text,
  analysed_at timestamptz,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger startups_touch before update on public.startups
  for each row execute function private.touch_updated_at();

-- inboxes (OpenMail) -----------------------------------------------------------
create table public.inboxes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  openmail_inbox_id text not null unique,
  openmail_pod_id text,
  address text not null unique,
  display_name text,
  status text not null default 'active' check (status in ('active', 'suspended', 'retired')),
  created_at timestamptz not null default now()
);

create index inboxes_owner_idx on public.inboxes (owner_id);

-- Webhook signing secrets never leave the private schema.
create table private.inbox_webhook_secrets (
  openmail_inbox_id text primary key,
  secret text not null,
  created_at timestamptz not null default now()
);

create table private.webhook_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);

-- investors --------------------------------------------------------------------
create table public.investors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  title text,
  firm text not null,
  email text not null,
  phone text,
  location text,
  investor_type text not null
    check (investor_type in ('vc', 'angel', 'family_office', 'accelerator', 'cvc')),
  stages text[] not null default '{}',
  sectors text[] not null default '{}',
  check_min_usd integer,
  check_max_usd integer,
  fund_size_usd bigint,
  portfolio text[] not null default '{}',
  thesis text,
  "values" text[] not null default '{}',
  focus_note text,
  leads_rounds boolean not null default false,
  min_revenue_band text,
  linkedin_url text,
  website_url text,
  created_at timestamptz not null default now()
);

create table public.saved_investors (
  owner_id uuid not null references auth.users (id) on delete cascade,
  investor_id uuid not null references public.investors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, investor_id)
);

create index saved_investors_investor_idx on public.saved_investors (investor_id);

-- outreach messages ------------------------------------------------------------
create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  investor_id uuid references public.investors (id) on delete set null,
  inbox_id uuid references public.inboxes (id) on delete set null,
  direction text not null check (direction in ('outbound', 'inbound')),
  openmail_message_id text unique,
  openmail_thread_id text,
  from_addr text,
  to_addr text,
  subject text,
  body text,
  status text not null default 'sent',
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  open_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index outreach_owner_idx on public.outreach_messages (owner_id, sent_at desc);
create index outreach_thread_idx on public.outreach_messages (openmail_thread_id);
create index outreach_investor_idx on public.outreach_messages (investor_id);
create index outreach_inbox_idx on public.outreach_messages (inbox_id);

-- new user bootstrap -----------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', '')
  );
  insert into public.startups (owner_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- RLS --------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.startups enable row level security;
alter table public.inboxes enable row level security;
alter table public.investors enable row level security;
alter table public.saved_investors enable row level security;
alter table public.outreach_messages enable row level security;

create policy "own profile read" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "own profile update" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own startup read" on public.startups
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "own startup update" on public.startups
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "own inboxes read" on public.inboxes
  for select to authenticated using ((select auth.uid()) = owner_id);

create policy "investors readable" on public.investors
  for select to authenticated using (true);

create policy "own saved read" on public.saved_investors
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "own saved insert" on public.saved_investors
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "own saved delete" on public.saved_investors
  for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "own outreach read" on public.outreach_messages
  for select to authenticated using ((select auth.uid()) = owner_id);

-- Founders cannot overwrite the analysis columns written by the worker.
revoke update on public.startups from authenticated;
grant update (
  name, domain, website_url, favicon_url, one_liner, summary, mission, goal,
  sectors, headcount, "values", stage, investor_types, revenue_band, raise_amount,
  location, traction, deck_path, deck_filename, deck_mime, deck_uploaded_at,
  wants_generated_deck, onboarding_completed_at
) on public.startups to authenticated;

revoke update on public.profiles from authenticated;
grant update (first_name, last_name) on public.profiles to authenticated;

-- Dashboard stats --------------------------------------------------------------
create or replace function public.dashboard_stats()
returns table (
  emails_sent bigint,
  investors_saved bigint,
  investors_contacted bigint,
  replies bigint,
  investors_replied bigint,
  opened bigint,
  open_rate numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with o as (
    select * from public.outreach_messages where owner_id = (select auth.uid())
  )
  select
    count(*) filter (where direction = 'outbound'),
    (select count(*) from public.saved_investors s where s.owner_id = (select auth.uid())),
    count(distinct investor_id) filter (where direction = 'outbound'),
    count(*) filter (where direction = 'inbound'),
    count(distinct investor_id) filter (where direction = 'inbound'),
    count(*) filter (where direction = 'outbound' and opened_at is not null),
    case
      when count(*) filter (where direction = 'outbound') = 0 then 0
      else round(
        100.0 * count(*) filter (where direction = 'outbound' and opened_at is not null)
        / count(*) filter (where direction = 'outbound'), 1)
    end
  from o;
$$;

-- Investor matching: hard filters are applied in the UI, this is the weighted score.
-- sector fit 30, stage fit 20, investor type 10, values 15, revenue fit 10, leads 5.
create or replace function public.match_investors()
returns table (investor_id uuid, score integer, reasons text[])
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select * from public.startups where owner_id = (select auth.uid())
  ),
  rev_order(band, ord) as (
    values ('pre_revenue', 0), ('0_10k', 1), ('11_20k', 2), ('21_30k', 3),
           ('31_50k', 4), ('51_100k', 5), ('100k_plus', 6)
  )
  select
    i.id,
    (
      case when cardinality(s.sectors) > 0 and i.sectors && s.sectors then 30 else 0 end
      + case when s.stage is not null and s.stage = any (i.stages) then 20 else 0 end
      + case when cardinality(s.investor_types) = 0 or i.investor_type = any (s.investor_types) then 10 else 0 end
      + case when cardinality(s."values") > 0 and i."values" && s."values" then 15
             when cardinality(s."values") = 0 then 5 else 0 end
      + case
          when i.min_revenue_band is null then 10
          when coalesce((select ord from rev_order where band = s.revenue_band), 0)
               >= coalesce((select ord from rev_order where band = i.min_revenue_band), 0) then 10
          else 0 end
      + case when i.leads_rounds then 5 else 0 end
    )::integer as score,
    array_remove(array[
      case when cardinality(s.sectors) > 0 and i.sectors && s.sectors then 'Sector fit' end,
      case when s.stage is not null and s.stage = any (i.stages) then 'Stage fit' end,
      case when cardinality(s."values") > 0 and i."values" && s."values" then 'Shared values' end,
      case when i.leads_rounds then 'Leads rounds' end
    ], null) as reasons
  from public.investors i
  cross join s;
$$;

-- Secrets for edge functions (Supabase Vault). Only the service role can read them.
create or replace function public.get_app_secret(secret_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1;
$$;

revoke all on function public.get_app_secret(text) from public, anon, authenticated;
grant execute on function public.get_app_secret(text) to service_role;

-- Storage: private pitch deck bucket, one folder per founder --------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('decks', 'decks', false, 52428800)
on conflict (id) do nothing;

create policy "decks read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'decks' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "decks insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'decks' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "decks update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'decks' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "decks delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'decks' and (storage.foldername(name))[1] = (select auth.uid())::text);
