-- ------------------------------------------------------------------------------------------
-- Founder activity now points at investors_achraf rows. The old uuid columns stay as legacy_investor_id
-- (history only); rows from the old directory are carried over where the email matches.

-- Primary keys move to the new ids (dropped first so the legacy columns can become nullable).
alter table public.saved_investors drop constraint if exists saved_investors_pkey;
alter table public.investor_matches drop constraint if exists investor_matches_pkey;
alter table public.investor_unlocks drop constraint if exists investor_unlocks_pkey;

do $$
declare
  t text;
begin
  foreach t in array array['saved_investors', 'investor_matches', 'investor_unlocks', 'outreach_messages', 'scheduled_emails'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'legacy_investor_id') then
      execute format('alter table public.%I rename column investor_id to legacy_investor_id', t);
      execute format('alter table public.%I alter column legacy_investor_id drop not null', t);
      execute format('alter table public.%I add column investor_id bigint references public.investors_achraf(id) on delete %s', t,
        case when t in ('outreach_messages') then 'set null' else 'cascade' end);
      execute format($u$update public.%I x set investor_id = a.id
        from public.investors o join public.investors_achraf a on lower(a.email) = lower(o.email)
        where o.id = x.legacy_investor_id$u$, t);
    end if;
  end loop;
end $$;

-- Unmatched legacy rows keep a null investor_id.
create unique index if not exists saved_investors_owner_lead on public.saved_investors (owner_id, investor_id);
create unique index if not exists investor_matches_owner_lead on public.investor_matches (owner_id, investor_id);
create unique index if not exists investor_unlocks_owner_lead on public.investor_unlocks (owner_id, investor_id);
create index if not exists saved_investors_lead_idx on public.saved_investors (investor_id);
create index if not exists investor_matches_lead_idx on public.investor_matches (investor_id);
create index if not exists outreach_lead_idx on public.outreach_messages (investor_id);
create index if not exists scheduled_lead_idx on public.scheduled_emails (investor_id);

-- New saves and queued emails must name a directory row.
drop policy if exists "own saved insert" on public.saved_investors;
create policy "own saved insert" on public.saved_investors for insert to authenticated
  with check ((select auth.uid()) = owner_id and investor_id is not null);
drop policy if exists "own scheduled insert" on public.scheduled_emails;
create policy "own scheduled insert" on public.scheduled_emails for insert to authenticated
  with check ((select auth.uid()) = owner_id and kind = 'first' and status = 'queued' and investor_id is not null and (select public.can_send_email()));

alter table public.export_log rename column investor_ids to legacy_investor_ids;
alter table public.export_log alter column legacy_investor_ids drop not null;
alter table public.export_log add column if not exists investor_ids bigint[] not null default '{}';

-- The source table is only ever read through security definer functions.
alter table public.investors_achraf enable row level security;
revoke all on public.investors_achraf from anon, authenticated;

-- The old contacts sync is retired.
do $$
begin
  perform cron.unschedule('sync-investors');
exception when others then null;
end $$;

-- ------------------------------------------------------------------------------------------
-- Founders may read names and firms (never contact details) of investors they work with, so lists such as
-- the Outbox and Inbox can show who an email is for.

grant select (id, first_name, last_name, full_name, title, firm, firm_domain, firm_website, city, country) on public.investors_achraf to authenticated;
drop policy if exists "investors you work with" on public.investors_achraf;
create policy "investors you work with" on public.investors_achraf for select to authenticated using (
  exists (select 1 from public.saved_investors x where x.owner_id = (select auth.uid()) and x.investor_id = investors_achraf.id)
  or exists (select 1 from public.outreach_messages x where x.owner_id = (select auth.uid()) and x.investor_id = investors_achraf.id)
  or exists (select 1 from public.scheduled_emails x where x.owner_id = (select auth.uid()) and x.investor_id = investors_achraf.id)
  or exists (select 1 from public.investor_matches x where x.owner_id = (select auth.uid()) and x.investor_id = investors_achraf.id)
  or exists (select 1 from public.investor_unlocks x where x.owner_id = (select auth.uid()) and x.investor_id = investors_achraf.id)
);

-- ------------------------------------------------------------------------------------------
-- Rows as the app shows them. Contact details are masked unless this founder revealed or exported them.

create or replace function private.lead_reasons(s private.lead_search, f private.lead_query)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array_remove(array[
    case when s.focus && f.f_focus then 'focus:' || array_to_string(array(select x from unnest(s.focus) x where x = any (f.f_focus)), ',') end,
    case when s.stages && f.f_stages then 'stage:' || (select x from unnest(s.stages) x where x = any (f.f_stages) limit 1) end,
    case when s.kw && f.f_kw then 'keywords:' || array_to_string(array(
      select k.keyword from private.lead_keywords k where k.id = any (s.kw) and k.id = any (f.f_kw) order by k.df limit 3), ',') end,
    case when f.f_country is not null and s.country = f.f_country then 'country:' || s.country
         when f.f_region is not null and s.region = f.f_region then 'region:' || s.region end,
    case when s.role in ('partner', 'angel', 'principal') then 'role:' || s.role end
  ], null);
$$;

create or replace function private.lead_rows(f private.lead_query, p_ids bigint[], p_scores integer[], p_uid uuid, p_unmask boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'full_name', coalesce(a.full_name, 'Unknown'), 'first_name', a.first_name, 'last_name', a.last_name,
    'title', a.title, 'headline', a.headline, 'role', s.role,
    'firm', coalesce(a.firm, 'Independent'), 'firm_domain', s.firm_domain, 'firm_website', a.firm_website, 'firm_linkedin', a.firm_linkedin,
    'industry', s.industry, 'size', s.size, 'founded', s.founded,
    'city', s.city, 'state', s.state, 'country', s.country, 'region', s.region,
    'location', nullif(concat_ws(', ', s.city, s.country), ''),
    'stages', to_jsonb(s.stages), 'focus', to_jsonb(s.focus),
    'investor_type', private.lead_investor_type(s.stages, coalesce(a.firm, ''), coalesce(a.title, '')),
    'email', case when u.open then a.email else private.mask_email(nullif(a.email, '')) end,
    'phone', case when u.open then a.phone else private.mask_phone(nullif(a.phone, '')) end,
    'linkedin_url', case when u.open then a.linkedin_url end,
    'has_email', s.has_email, 'has_phone', s.has_phone, 'has_linkedin', s.has_linkedin, 'unlocked', u.open,
    'score', x.score, 'reasons', to_jsonb(private.lead_reasons(s, f)),
    'saved', a.id = any (coalesce(f.saved_ids, '{}')),
    'queued', a.id = any (coalesce(f.queued_ids, '{}')),
    'contacted', a.id = any (coalesce(f.contacted_ids, '{}')),
    'opened', a.id = any (coalesce(f.opened_ids, '{}')),
    'replied', a.id = any (coalesce(f.replied_ids, '{}')),
    'pick_rank', m.rank, 'pick_fit', m.fit, 'pick_why', m.why
  ) order by x.ord), '[]'::jsonb)
  from unnest(p_ids, p_scores) with ordinality as x(id, score, ord)
  join public.investors_achraf a on a.id = x.id
  join private.lead_search s on s.id = x.id
  left join public.investor_matches m on m.owner_id = p_uid and m.investor_id = x.id
  cross join lateral (
    select p_unmask or exists (select 1 from public.investor_unlocks u where u.owner_id = p_uid and u.investor_id = x.id) as open
  ) u;
$$;

-- ------------------------------------------------------------------------------------------
-- Public, metered functions. The browser never reads investors_achraf or the search tables directly.

drop function if exists public.investor_facets(jsonb);
drop function if exists public.investor_detail(uuid);
drop function if exists public.reveal_investor(uuid);

create or replace function public.search_investors(p_filters jsonb default '{}', p_sort text default 'match', p_dir text default 'desc', p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
set jit = 'off'
as $$
declare
  uid uuid := auth.uid();
  e record;
  lim integer;
  off integer := least(greatest(coalesce(p_offset, 0), 0), 10000);
  f private.lead_query;
  ids bigint[];
  scores integer[];
begin
  if uid is null then raise exception 'not_signed_in: Log in to search investors.' using errcode = 'P0001'; end if;
  select * into e from private.entitlements(uid);
  perform private.check_rate(uid, e.searches_per_minute);
  if e.rows_viewed_today >= e.daily_row_views then
    raise exception 'daily_limit: You have viewed % investors today, the most your plan allows. It resets at midnight UTC.', e.daily_row_views using errcode = 'P0001';
  end if;
  lim := least(greatest(coalesce(p_limit, 50), 1), e.page_size_max);
  if e.max_rows is not null then
    if off >= e.max_rows then
      raise exception 'page_limit: Your plan shows the first % results for any search. Narrow the filters or upgrade to see more.', e.max_rows using errcode = 'P0001';
    end if;
    lim := least(lim, e.max_rows - off);
  end if;

  f := private.lead_query_from(p_filters, uid);
  select coalesce(array_agg(p.id), '{}'), coalesce(array_agg(p.score), '{}') into ids, scores
  from private.lead_page(f, p_sort, p_dir, lim, off) p;

  insert into private.search_usage as u (owner_id, day, rows_viewed) values (uid, current_date, cardinality(ids))
  on conflict (owner_id, day) do update set rows_viewed = u.rows_viewed + excluded.rows_viewed;

  return jsonb_build_object(
    'rows', private.lead_rows(f, ids, scores, uid, false),
    'limits', jsonb_build_object('max_rows', e.max_rows, 'page_size', e.page_size_max, 'plan', e.plan_id)
  );
end;
$$;

-- How many investors match: exact up to 10,000, then 10001 (shown as 10,000+); null if it took too long.
create or replace function public.count_investors(p_filters jsonb default '{}')
returns integer
language plpgsql
security definer
set search_path = ''
set jit = 'off'
as $$
declare
  uid uuid := auth.uid();
  e record;
begin
  if uid is null then raise exception 'not_signed_in: Log in to search investors.' using errcode = 'P0001'; end if;
  select * into e from private.entitlements(uid);
  perform private.check_rate(uid, e.searches_per_minute);
  return private.lead_count(private.lead_query_from(p_filters, uid));
end;
$$;

-- The allowed values for every list filter, with counts, for the filter bar and the AI.
create or replace function public.lead_facets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(facet, vals) from (
      select facet, jsonb_agg(jsonb_build_object('value', value, 'n', n) order by n desc, value) as vals
      from private.lead_facets group by facet
    ) x
  ), '{}'::jsonb) end;
$$;

create or replace function public.directory_size()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from private.lead_search;
$$;

create or replace function public.investor_detail(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e record;
  a public.investors_achraf;
  s private.lead_search;
  open boolean;
begin
  if uid is null then raise exception 'not_signed_in: Log in to view investors.' using errcode = 'P0001'; end if;
  select * into e from private.entitlements(uid);
  perform private.check_rate(uid, e.searches_per_minute);
  select * into a from public.investors_achraf x where x.id = p_id;
  select * into s from private.lead_search x where x.id = p_id;
  if a.id is null then raise exception 'not_found: This investor is no longer in the directory.' using errcode = 'P0001'; end if;
  open := exists (select 1 from public.investor_unlocks u where u.owner_id = uid and u.investor_id = p_id);
  return jsonb_build_object(
    'headline', a.headline, 'about', a.firm_about,
    'specialties', to_jsonb(coalesce(array(select trim(x) from unnest(string_to_array(a.specialties, ';')) x where trim(x) <> ''), '{}')),
    'firm_website', a.firm_website, 'firm_linkedin', a.firm_linkedin, 'industry', s.industry, 'size', s.size, 'founded', s.founded,
    'stages', to_jsonb(s.stages), 'focus', to_jsonb(s.focus), 'unlocked', open,
    'contact', case when open then jsonb_build_object(
      'email', a.email, 'other_emails', a.other_emails, 'phone', a.phone, 'linkedin_url', a.linkedin_url
    ) else jsonb_build_object(
      'email', private.mask_email(nullif(a.email, '')), 'other_emails', null, 'phone', private.mask_phone(nullif(a.phone, '')), 'linkedin_url', null
    ) end
  );
end;
$$;

-- Spends one reveal credit (never twice for the same investor) and returns their contact details.
create or replace function public.reveal_investor(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e record;
  a public.investors_achraf;
begin
  if uid is null then raise exception 'not_signed_in: Log in to reveal contact details.' using errcode = 'P0001'; end if;
  select * into a from public.investors_achraf x where x.id = p_id;
  if a.id is null then raise exception 'not_found: This investor is no longer in the directory.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.investor_unlocks u where u.owner_id = uid and u.investor_id = p_id) then
    select * into e from private.entitlements(uid);
    perform private.check_rate(uid, e.searches_per_minute);
    if not e.paid then
      raise exception 'trial_locked: Contact details show when your plan starts, after the 7-day trial.' using errcode = 'P0001';
    end if;
    if e.reveals_left <= 0 then
      raise exception 'no_reveals: You have used all % contact reveals in this period. Upgrade for more.', e.reveals_total using errcode = 'P0001';
    end if;
    insert into public.investor_unlocks (owner_id, investor_id, source) values (uid, p_id, 'reveal') on conflict do nothing;
  end if;
  return jsonb_build_object('email', a.email, 'other_emails', a.other_emails, 'phone', a.phone, 'linkedin_url', a.linkedin_url);
end;
$$;

-- Exports matching investors with contact details. Rows not already revealed or exported cost one credit each;
-- the data, the charge and the audit row commit together.
create or replace function public.export_investors(p_filters jsonb default '{}', p_sort text default 'match', p_dir text default 'desc', p_limit integer default 500, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
set jit = 'off'
as $$
declare
  uid uuid := auth.uid();
  e record;
  f private.lead_query;
  ids bigint[];
  scores integer[];
  fresh bigint[];
  charged integer;
begin
  if uid is null then raise exception 'not_signed_in: Log in to export.' using errcode = 'P0001'; end if;
  select * into e from private.entitlements(uid);
  if not e.paid or e.exports_total = 0 then
    raise exception 'export_locked: Exports start when your plan starts, after the 7-day trial.' using errcode = 'P0001';
  end if;
  perform private.check_rate(uid, e.searches_per_minute);
  if e.exports_left <= 0 then
    raise exception 'no_exports: You have used all % export credits in this period.', e.exports_total using errcode = 'P0001';
  end if;

  f := private.lead_query_from(p_filters, uid);
  with p as (
    select x.id, x.score, x.ord,
      not exists (select 1 from public.investor_unlocks u where u.owner_id = uid and u.investor_id = x.id) as is_new
    from private.lead_page(f, p_sort, p_dir, least(greatest(coalesce(p_limit, 500), 1), 500), greatest(coalesce(p_offset, 0), 0)) with ordinality as x(id, score, ord)
  ), c as (
    select p.*, sum(p.is_new::int) over (order by p.ord) as spent from p
  )
  select coalesce(array_agg(c.id order by c.ord), '{}'), coalesce(array_agg(c.score order by c.ord), '{}'),
    coalesce(array_agg(c.id) filter (where c.is_new), '{}'), coalesce(sum(c.is_new::int), 0)
  into ids, scores, fresh, charged
  from c where c.spent <= e.exports_left;

  insert into public.investor_unlocks (owner_id, investor_id, source) select uid, x, 'export' from unnest(fresh) x on conflict do nothing;
  insert into public.export_log (owner_id, rows_exported, credits, investor_ids, filters)
  values (uid, cardinality(ids), charged, ids, coalesce(p_filters, '{}'));

  return jsonb_build_object('rows', private.lead_rows(f, ids, scores, uid, true), 'charged', charged, 'exports_left', e.exports_left - charged);
end;
$$;

revoke all on function public.search_investors(jsonb, text, text, integer, integer), public.count_investors(jsonb), public.lead_facets(),
  public.directory_size(), public.investor_detail(bigint), public.reveal_investor(bigint), public.export_investors(jsonb, text, text, integer, integer) from public, anon;
grant execute on function public.search_investors(jsonb, text, text, integer, integer), public.count_investors(jsonb), public.lead_facets(),
  public.directory_size(), public.investor_detail(bigint), public.reveal_investor(bigint), public.export_investors(jsonb, text, text, integer, integer) to authenticated;

-- ------------------------------------------------------------------------------------------
-- AI search history (rate limits, recent searches, cost) and saved searches.

create table if not exists public.ai_searches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  title text,
  summary text,
  filters jsonb not null default '{}',
  notes text[] not null default '{}',
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  usd numeric(10, 4) not null default 0,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ai_searches_owner_created on public.ai_searches (owner_id, created_at desc);
alter table public.ai_searches enable row level security;
drop policy if exists "own ai searches read" on public.ai_searches;
create policy "own ai searches read" on public.ai_searches for select to authenticated using (owner_id = (select auth.uid()));

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) between 1 and 80),
  filters jsonb not null check (jsonb_typeof(filters) = 'object' and octet_length(filters::text) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists saved_searches_owner_name on public.saved_searches (owner_id, lower(name));
alter table public.saved_searches enable row level security;
drop policy if exists "own saved searches" on public.saved_searches;
create policy "own saved searches" on public.saved_searches for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Follow-ups: investor ids are now directory ids.
drop function if exists public.follow_up_candidates(integer);
create function public.follow_up_candidates(p_limit integer default 20)
returns table (message_id uuid, owner_id uuid, investor_id bigint, thread_id text, subject text, body text, sent_at timestamptz, follow_up_days integer)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.owner_id, o.investor_id, o.openmail_thread_id, o.subject, o.body, o.sent_at, s.follow_up_days
  from public.outreach_messages o
  join public.startups s on s.owner_id = o.owner_id
  where o.direction = 'outbound'
    and o.kind = 'first'
    and o.investor_id is not null
    and o.openmail_thread_id is not null
    and s.auto_follow_up
    and exists (select 1 from public.subscriptions sub where sub.owner_id = o.owner_id and sub.status in ('active', 'past_due'))
    and o.sent_at <= now() - make_interval(days => s.follow_up_days) + interval '12 hours'
    and o.sent_at >= now() - interval '21 days'
    and not exists (
      select 1 from public.outreach_messages r
      where r.direction = 'inbound'
        and (r.openmail_thread_id = o.openmail_thread_id or (r.owner_id = o.owner_id and r.investor_id = o.investor_id))
    )
    and not exists (select 1 from public.scheduled_emails f where f.parent_message_id = o.id)
  order by o.sent_at
  limit p_limit;
$$;
revoke all on function public.follow_up_candidates(integer) from public, anon, authenticated;
grant execute on function public.follow_up_candidates(integer) to service_role;
