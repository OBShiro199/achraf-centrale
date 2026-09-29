-- Plans, credits and anti-scraping limits, plus a narrow search index so the directory stays fast at
-- 200,000+ investors.
--
-- Access model: founders never read investor contact details from a table. Every read goes through
-- security definer functions that check the plan, count usage and mask contact data:
--   search_investors   one page of results, contact details masked unless revealed. Capped by plan
--                      depth (trial: first 500 rows, which is page 10), page size, searches per
--                      minute and rows viewed per day.
--   investor_facets    option counts only, no contact data. Rate limited.
--   investor_detail    the drawer: firm description and keywords; contact masked unless revealed.
--   reveal_investor    spends one reveal credit and returns full contact details.
--   export_investors   spends one export credit per new row. Not available on the trial.
-- The investors table itself only exposes names and firms, and only for investors the founder has
-- saved, emailed, queued, been matched with or revealed.

create extension if not exists intarray with schema extensions;

-- 1. Directory rules ----------------------------------------------------------------------------

-- Only people with both an email and a LinkedIn profile belong in the directory.
update public.investors set active = false where source = 'contacts' and active and linkedin_url is null;

-- The reply-testing contact and every test-mode send go to one inbox.
update public.investors set email = 'oliverburt3+centraletest@gmail.com' where source = 'test';

-- 2. Narrow search index ------------------------------------------------------------------------

-- Keywords as stable integer ids, so each investor's keyword set is a small int[] instead of kilobytes of text.
create table private.keyword_ids (
  id serial primary key,
  keyword text not null unique
);

-- One slim row per active investor with every filterable and sortable field. Searches scan this
-- (tens of bytes per row), then fetch the wide investors rows for the one page they return.
create table private.investor_index (
  id uuid primary key references public.investors (id) on delete cascade,
  source text not null,
  firm_key text not null,
  full_name text not null,
  firm text not null,
  investor_type text not null,
  role text not null,
  role_rank smallint not null,
  stages text[] not null,
  sectors text[] not null,
  vals text[] not null,
  kw integer[] not null,
  region text,
  country text,
  city text,
  firm_employees integer,
  firm_funding bigint,
  firm_founded smallint,
  has_mobile boolean not null,
  has_direct boolean not null,
  has_phone boolean not null,
  has_linkedin boolean not null,
  has_twitter boolean not null,
  has_firm_phone boolean not null,
  has_website boolean not null
);
create index investor_index_kw on private.investor_index using gin (kw array_ops);
create index investor_index_firm_key on private.investor_index (firm_key);

create or replace function private.role_rank(p_role text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (case p_role when 'partner' then 0 when 'angel' then 1 when 'principal' then 2 when 'venture_partner' then 3
    when 'associate' then 4 when 'operating' then 5 when 'other' then 6 when 'investor_relations' then 7 else 8 end)::smallint;
$$;

-- Keeps the index in step with investors on every write.
create or replace function private.investor_index_tg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids integer[];
begin
  if not new.active then
    delete from private.investor_index where id = new.id;
    return new;
  end if;
  if cardinality(new.keywords) > 0 then
    insert into private.keyword_ids (keyword) select distinct k from unnest(new.keywords) k on conflict (keyword) do nothing;
    select coalesce(array_agg(distinct k.id), '{}') into ids from private.keyword_ids k where k.keyword = any (new.keywords);
  else
    ids := '{}';
  end if;
  insert into private.investor_index as x (
    id, source, firm_key, full_name, firm, investor_type, role, role_rank, stages, sectors, vals, kw, region, country, city,
    firm_employees, firm_funding, firm_founded, has_mobile, has_direct, has_phone, has_linkedin, has_twitter, has_firm_phone, has_website
  ) values (
    new.id, new.source, coalesce(new.firm_domain, lower(new.firm)), new.full_name, new.firm, new.investor_type, new.role,
    private.role_rank(new.role), new.stages, new.sectors, new."values", ids, new.region, new.country, new.city,
    new.firm_employees, new.firm_funding, new.firm_founded, new.mobile is not null, new.direct_phone is not null, new.phone is not null,
    new.linkedin_url is not null, new.twitter_url is not null, new.firm_phone is not null, new.website_url is not null
  )
  on conflict (id) do update set
    source = excluded.source, firm_key = excluded.firm_key, full_name = excluded.full_name, firm = excluded.firm,
    investor_type = excluded.investor_type, role = excluded.role, role_rank = excluded.role_rank, stages = excluded.stages,
    sectors = excluded.sectors, vals = excluded.vals, kw = excluded.kw, region = excluded.region, country = excluded.country,
    city = excluded.city, firm_employees = excluded.firm_employees, firm_funding = excluded.firm_funding,
    firm_founded = excluded.firm_founded, has_mobile = excluded.has_mobile, has_direct = excluded.has_direct,
    has_phone = excluded.has_phone, has_linkedin = excluded.has_linkedin, has_twitter = excluded.has_twitter,
    has_firm_phone = excluded.has_firm_phone, has_website = excluded.has_website;
  return new;
end;
$$;

create trigger investors_index after insert or update on public.investors
  for each row execute function private.investor_index_tg();

-- Backfill the index for everyone already in the directory.
insert into private.keyword_ids (keyword)
select distinct k from public.investors i, unnest(i.keywords) k where i.active
on conflict (keyword) do nothing;

insert into private.investor_index (
  id, source, firm_key, full_name, firm, investor_type, role, role_rank, stages, sectors, vals, kw, region, country, city,
  firm_employees, firm_funding, firm_founded, has_mobile, has_direct, has_phone, has_linkedin, has_twitter, has_firm_phone, has_website
)
select
  i.id, i.source, coalesce(i.firm_domain, lower(i.firm)), i.full_name, i.firm, i.investor_type, i.role, private.role_rank(i.role),
  i.stages, i.sectors, i."values",
  coalesce((select array_agg(distinct k.id) from private.keyword_ids k where k.keyword = any (i.keywords)), '{}'),
  i.region, i.country, i.city, i.firm_employees, i.firm_funding, i.firm_founded,
  i.mobile is not null, i.direct_phone is not null, i.phone is not null, i.linkedin_url is not null, i.twitter_url is not null,
  i.firm_phone is not null, i.website_url is not null
from public.investors i
where i.active;

-- 3. Plans, subscriptions and usage -------------------------------------------------------------

create table public.plans (
  id text primary key,
  name text not null,
  price_gbp integer not null,
  stripe_lookup_key text unique,
  trial_days integer not null default 0,
  -- Deepest result a search can page to. Null means no cap.
  max_rows integer,
  page_size_max integer not null,
  reveals_per_period integer not null,
  export_credits_per_period integer not null,
  daily_row_views integer not null,
  searches_per_minute integer not null,
  sort_order integer not null
);
alter table public.plans enable row level security;
create policy "plans readable" on public.plans for select to anon, authenticated using (true);
grant select on public.plans to anon, authenticated;

insert into public.plans values
  ('trial',   'Free trial', 0,   null,                        7, 500,  50,  25,   0,    1500,  40, 0),
  ('starter', 'Starter',    49,  'centrale_starter_monthly',  0, 5000, 100, 500,  500,  10000, 60, 1),
  ('pro',     'Pro',        149, 'centrale_pro_monthly',      0, null, 100, 2500, 2500, 50000, 120, 2);

create table public.subscriptions (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  plan_id text not null default 'trial' references public.plans (id),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  trial_ends_at timestamptz,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy "own subscription read" on public.subscriptions for select to authenticated using ((select auth.uid()) = owner_id);
grant select on public.subscriptions to authenticated;
create trigger subscriptions_touch before update on public.subscriptions for each row execute function private.touch_updated_at();

-- Every new account starts on the free trial.
create or replace function private.start_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions (owner_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
  values (new.id, 'trial', 'trialing', now() + interval '7 days', now(), now() + interval '7 days')
  on conflict (owner_id) do nothing;
  return new;
end;
$$;
create trigger profiles_start_trial after insert on public.profiles for each row execute function private.start_trial();

insert into public.subscriptions (owner_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
select id, 'trial', 'trialing', now() + interval '7 days', now(), now() + interval '7 days' from public.profiles
on conflict (owner_id) do nothing;

-- Contact details a founder has paid a credit for (a reveal, or a row in an export).
create table public.investor_unlocks (
  owner_id uuid not null references auth.users (id) on delete cascade,
  investor_id uuid not null references public.investors (id) on delete cascade,
  source text not null check (source in ('reveal', 'export')),
  created_at timestamptz not null default now(),
  primary key (owner_id, investor_id)
);
create index investor_unlocks_period on public.investor_unlocks (owner_id, source, created_at);
alter table public.investor_unlocks enable row level security;
create policy "own unlocks read" on public.investor_unlocks for select to authenticated using ((select auth.uid()) = owner_id);
grant select on public.investor_unlocks to authenticated;

-- Every export, for credits and for tracing a leaked file back to an account.
create table public.export_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  rows_exported integer not null,
  credits integer not null,
  investor_ids uuid[] not null,
  filters jsonb not null,
  created_at timestamptz not null default now()
);
create index export_log_owner on public.export_log (owner_id, created_at);
alter table public.export_log enable row level security;
create policy "own exports read" on public.export_log for select to authenticated using ((select auth.uid()) = owner_id);
grant select (id, owner_id, rows_exported, credits, created_at) on public.export_log to authenticated;

create table private.rate_limits (
  owner_id uuid primary key,
  window_start timestamptz not null,
  calls integer not null
);

create table private.search_usage (
  owner_id uuid not null,
  day date not null,
  rows_viewed integer not null default 0,
  primary key (owner_id, day)
);

-- What the founder's plan allows right now, with credits left in the current period.
create or replace function private.entitlements(p_uid uuid)
returns table (
  plan_id text, plan_name text, status text, active boolean, trial_ends_at timestamptz, period_start timestamptz, period_end timestamptz,
  max_rows integer, page_size_max integer, reveals_total integer, reveals_left integer, exports_total integer, exports_left integer,
  daily_row_views integer, rows_viewed_today integer, searches_per_minute integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select
      coalesce(sub.plan_id, 'trial') as plan_id,
      coalesce(sub.status, 'expired') as status,
      sub.trial_ends_at,
      coalesce(sub.current_period_start, now()) as ps,
      sub.current_period_end as pe
    from (select 1) one
    left join public.subscriptions sub on sub.owner_id = p_uid
  ),
  a as (
    select s.*, (s.status in ('active', 'past_due') or (s.status = 'trialing' and coalesce(s.trial_ends_at, now()) > now())) as ok from s
  )
  select
    a.plan_id, p.name, case when a.ok then a.status else 'expired' end, a.ok, a.trial_ends_at, a.ps, a.pe,
    case when a.ok then p.max_rows else 100 end,
    p.page_size_max,
    case when a.ok then p.reveals_per_period else 0 end,
    case when a.ok then greatest(0, p.reveals_per_period - (
      select count(*) from public.investor_unlocks u where u.owner_id = p_uid and u.source = 'reveal' and u.created_at >= a.ps
    ))::int else 0 end,
    case when a.ok then p.export_credits_per_period else 0 end,
    case when a.ok then greatest(0, p.export_credits_per_period - coalesce((
      select sum(x.credits) from public.export_log x where x.owner_id = p_uid and x.created_at >= a.ps
    ), 0))::int else 0 end,
    case when a.ok then p.daily_row_views else 300 end,
    coalesce((select u.rows_viewed from private.search_usage u where u.owner_id = p_uid and u.day = current_date), 0),
    p.searches_per_minute
  from a
  join public.plans p on p.id = a.plan_id;
$$;

create or replace function private.check_rate(p_uid uuid, p_limit integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into private.rate_limits as r (owner_id, window_start, calls) values (p_uid, now(), 1)
  on conflict (owner_id) do update set
    calls = case when r.window_start < now() - interval '1 minute' then 1 else r.calls + 1 end,
    window_start = case when r.window_start < now() - interval '1 minute' then now() else r.window_start end
  returning calls into n;
  if n > p_limit then
    raise exception 'rate_limited: Too many searches in a minute. Wait a moment and try again.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(split_part(p_email, '@', 1), 1) || '•••@' || split_part(p_email, '@', 2);
$$;

-- 4. Directory query on the index -------------------------------------------------------------

drop function if exists public.search_investors(jsonb, text, text, integer, integer);
drop function if exists public.investor_facets(jsonb);
drop function if exists private.investor_directory(jsonb);
drop function if exists public.match_investors();

-- Filter logic: AND across groups, OR within a group. Keywords can be any or all; excluded keywords
-- never match. Location (regions, countries, cities) is one group. Each ex_<group> flag is every
-- other group's result, used for facet counts that stay correct while that group is being edited.
create or replace function private.investor_directory(p jsonb, p_uid uuid)
returns table (
  id uuid, score integer, sector_hit boolean, stage_hit boolean, kw_hits integer[], country_hit boolean, region_hit boolean, value_hit boolean,
  role_rank smallint, firm_key text, full_name text, firm text, country text, firm_employees integer, firm_funding bigint, firm_founded smallint,
  investor_type text, stages text[], sectors text[], vals text[], region text, city text, role text, source text,
  has_mobile boolean, has_direct boolean, has_phone boolean, has_linkedin boolean, has_twitter boolean, has_firm_phone boolean, has_website boolean,
  saved boolean, contacted boolean, replied boolean, opened boolean, queued boolean, unlocked boolean,
  pick_rank integer, pick_fit integer, pick_why text,
  m_all boolean, ex_type boolean, ex_stage boolean, ex_sector boolean, ex_value boolean, ex_loc boolean,
  ex_role boolean, ex_size boolean, ex_funding boolean, ex_has boolean, ex_status boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with
  f as (
    select
      nullif(trim(p ->> 'q'), '') as q,
      '%' || replace(replace(replace(coalesce(trim(p ->> 'q'), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as qlike,
      private.jarr(p -> 'types') as types,
      private.jarr(p -> 'stages') as stages,
      private.jarr(p -> 'sectors') as sectors,
      private.jarr(p -> 'values') as vals,
      private.jarr(p -> 'regions') as regions,
      private.jarr(p -> 'countries') as countries,
      private.jarr(p -> 'cities') as cities,
      private.jarr(p -> 'roles') as roles,
      array(select lower(x) from unnest(private.jarr(p -> 'keywords')) x) as kws,
      coalesce(p ->> 'keyword_mode', 'any') as kw_mode,
      array(select lower(x) from unnest(private.jarr(p -> 'exclude_keywords')) x) as kw_not,
      private.jarr(p -> 'firm_size') as sizes,
      private.jarr(p -> 'firm_funding') as fundings,
      nullif(p ->> 'founded_after', '')::int as founded_after,
      nullif(p ->> 'founded_before', '')::int as founded_before,
      private.jarr(p -> 'has') as has,
      coalesce(nullif(p ->> 'status', ''), 'any') as status,
      coalesce((p ->> 'saved_only')::boolean, false) as saved_only,
      coalesce((p ->> 'picks_only')::boolean, false) as picks_only,
      coalesce((p ->> 'include_non_investors')::boolean, false) as include_non_investors,
      coalesce(nullif(p ->> 'min_score', '')::int, 0) as min_score
  ),
  fk as (
    select
      coalesce((select array_agg(k.id) from private.keyword_ids k, f where k.keyword = any (f.kws)), '{}') as kw_ids,
      coalesce((select array_agg(k.id) from private.keyword_ids k, f where k.keyword = any (f.kw_not)), '{}') as kw_not_ids
  ),
  -- Full-text matches come from the GIN index on the wide table, only when a search term is given.
  qhits as (
    select i.id from public.investors i, f
    where f.q is not null and i.active and i.search @@ websearch_to_tsquery('english', f.q)
  ),
  s as (
    select
      coalesce(st.sectors, '{}') as sectors,
      st.stage,
      coalesce(st.investor_types, '{}') as investor_types,
      coalesce(st."values", '{}') as vals,
      st.country,
      private.region_of(st.country) as region,
      array(select distinct lower(x) from unnest(coalesce(st.match_keywords, '{}') || coalesce(st.keywords, '{}')) x) as terms
    from (select 1) one
    left join public.startups st on st.owner_id = p_uid
  ),
  total as (select greatest(count(*), 1)::numeric as n from private.investor_index),
  -- The founder's match keywords split by rarity: rare ones say more about fit, so they score double.
  terms as (
    select k.id, d.df
    from s cross join lateral unnest(s.terms) as u(term)
    join private.keyword_ids k on k.keyword = u.term
    join public.investor_keywords d on d.keyword = u.term
    where d.df <= (select n from total) * 0.25
  ),
  tw as (
    select
      coalesce(array_agg(t.id) filter (where t.df <= (select n from total) * 0.03), '{}')::int[] as hi,
      coalesce(array_agg(t.id) filter (where t.df > (select n from total) * 0.03), '{}')::int[] as lo
    from terms t
  ),
  mine as (
    select o.investor_id,
      bool_or(o.direction = 'outbound') as contacted,
      bool_or(o.direction = 'inbound') as replied,
      bool_or(o.opened_at is not null) as opened
    from public.outreach_messages o
    where o.owner_id = p_uid and o.investor_id is not null
    group by o.investor_id
  ),
  queued as (
    select distinct e.investor_id from public.scheduled_emails e where e.owner_id = p_uid and e.status in ('queued', 'sending')
  ),
  saved as (select v.investor_id from public.saved_investors v where v.owner_id = p_uid),
  unlocked as (select u.investor_id from public.investor_unlocks u where u.owner_id = p_uid),
  picks as (select m.investor_id, m.rank, m.fit, m.why from public.investor_matches m where m.owner_id = p_uid),
  base as (
    select
      x.*,
      cardinality(s.sectors) > 0 and x.sectors && s.sectors as sector_hit,
      s.stage is not null and s.stage = any (x.stages) as stage_hit,
      s.country is not null and x.country = s.country as country_hit,
      s.region is not null and x.region = s.region as region_hit,
      cardinality(s.vals) > 0 and x.vals && s.vals as value_hit,
      x.kw operator(extensions.&) tw.hi as hits_hi,
      x.kw operator(extensions.&) tw.lo as hits_lo,
      s.stage as s_stage, s.investor_types as s_types,
      coalesce(mine.contacted, false) as contacted,
      coalesce(mine.replied, false) as replied,
      coalesce(mine.opened, false) as opened,
      queued.investor_id is not null as queued,
      saved.investor_id is not null as saved,
      unlocked.investor_id is not null as unlocked,
      picks.rank as pick_rank, picks.fit as pick_fit, picks.why as pick_why
    from private.investor_index x
    cross join s
    cross join tw
    left join mine on mine.investor_id = x.id
    left join queued on queued.investor_id = x.id
    left join saved on saved.investor_id = x.id
    left join unlocked on unlocked.investor_id = x.id
    left join picks on picks.investor_id = x.id
  ),
  scored as (
    select b.*,
      greatest(0, least(100,
        case when b.sector_hit then 25 else 0 end
        + least(25, 6 * extensions.icount(b.hits_hi) + 3 * extensions.icount(b.hits_lo))
        + case when b.stage_hit then 15 when cardinality(b.stages) = 0 then 5 else 0 end
        + case when cardinality(b.s_types) = 0 then 5 when b.investor_type = any (b.s_types) then 10 else 0 end
        + case when b.country_hit then 10 when b.region_hit then 5 else 0 end
        + case when b.value_hit then 5 else 0 end
        + case b.role when 'partner' then 10 when 'angel' then 10 when 'principal' then 8 when 'venture_partner' then 5
                      when 'associate' then 4 when 'operating' then 0 when 'other' then 0 else -20 end
        - case when b.investor_type = 'pe' and b.s_stage in ('pre_seed', 'seed', 'angel', 'series_a') then 20 else 0 end
      ))::int as score
    from base b
  ),
  flagged as (
    select sc.*,
      (
        case when f.q is null then true
             else sc.full_name ilike f.qlike or sc.firm ilike f.qlike or sc.firm_key ilike f.qlike or sc.id in (select qh.id from qhits qh) end
        and case when cardinality(f.kws) = 0 then true
                 when f.kw_mode = 'all' then cardinality(fk.kw_ids) = cardinality(f.kws) and sc.kw @> fk.kw_ids
                 else sc.kw && fk.kw_ids end
        and case when cardinality(fk.kw_not_ids) = 0 then true else not (sc.kw && fk.kw_not_ids) end
        and (f.founded_after is null or sc.firm_founded >= f.founded_after)
        and (f.founded_before is null or sc.firm_founded <= f.founded_before)
        and (not f.saved_only or sc.saved)
        and (not f.picks_only or sc.pick_rank is not null)
        and sc.score >= f.min_score
        -- Investor relations and LP contacts do not write cheques; they appear only when asked for.
        and (f.include_non_investors or cardinality(f.roles) > 0 or sc.role not in ('investor_relations', 'lp'))
      ) as m_base,
      (cardinality(f.types) = 0 or sc.investor_type = any (f.types)) as m_type,
      (cardinality(f.stages) = 0 or sc.stages && f.stages) as m_stage,
      (cardinality(f.sectors) = 0 or sc.sectors && f.sectors) as m_sector,
      (cardinality(f.vals) = 0 or sc.vals && f.vals) as m_value,
      (
        (cardinality(f.regions) + cardinality(f.countries) + cardinality(f.cities)) = 0
        or sc.region = any (f.regions) or sc.country = any (f.countries) or sc.city = any (f.cities)
      ) as m_loc,
      (cardinality(f.roles) = 0 or sc.role = any (f.roles)) as m_role,
      (
        cardinality(f.sizes) = 0
        or ('1_10' = any (f.sizes) and sc.firm_employees between 1 and 10)
        or ('11_50' = any (f.sizes) and sc.firm_employees between 11 and 50)
        or ('51_200' = any (f.sizes) and sc.firm_employees between 51 and 200)
        or ('201_1000' = any (f.sizes) and sc.firm_employees between 201 and 1000)
        or ('1000_plus' = any (f.sizes) and sc.firm_employees > 1000)
      ) as m_size,
      (
        cardinality(f.fundings) = 0
        or ('under_50m' = any (f.fundings) and sc.firm_funding < 50000000)
        or ('50_250m' = any (f.fundings) and sc.firm_funding >= 50000000 and sc.firm_funding < 250000000)
        or ('250m_1b' = any (f.fundings) and sc.firm_funding >= 250000000 and sc.firm_funding < 1000000000)
        or ('1b_plus' = any (f.fundings) and sc.firm_funding >= 1000000000)
      ) as m_funding,
      (
        ('mobile' <> all (f.has) or sc.has_mobile)
        and ('direct' <> all (f.has) or sc.has_direct)
        and ('any_phone' <> all (f.has) or sc.has_phone)
        and ('linkedin' <> all (f.has) or sc.has_linkedin)
        and ('twitter' <> all (f.has) or sc.has_twitter)
        and ('firm_phone' <> all (f.has) or sc.has_firm_phone)
        and ('website' <> all (f.has) or sc.has_website)
      ) as m_has,
      (
        case f.status
          when 'new' then not sc.contacted and not sc.queued
          when 'queued' then sc.queued
          when 'contacted' then sc.contacted
          when 'opened' then sc.opened
          when 'replied' then sc.replied
          when 'no_reply' then sc.contacted and not sc.replied
          else true
        end
      ) as m_status
    from scored sc
    cross join f
    cross join fk
  )
  select
    x.id, x.score, x.sector_hit, x.stage_hit, x.hits_hi || x.hits_lo, x.country_hit, x.region_hit, x.value_hit,
    x.role_rank, x.firm_key, x.full_name, x.firm, x.country, x.firm_employees, x.firm_funding, x.firm_founded,
    x.investor_type, x.stages, x.sectors, x.vals, x.region, x.city, x.role, x.source,
    x.has_mobile, x.has_direct, x.has_phone, x.has_linkedin, x.has_twitter, x.has_firm_phone, x.has_website,
    x.saved, x.contacted, x.replied, x.opened, x.queued, x.unlocked,
    x.pick_rank, x.pick_fit, x.pick_why,
    x.m_base and x.m_type and x.m_stage and x.m_sector and x.m_value and x.m_loc and x.m_role and x.m_size and x.m_funding and x.m_has and x.m_status,
    x.m_base and x.m_stage and x.m_sector and x.m_value and x.m_loc and x.m_role and x.m_size and x.m_funding and x.m_has and x.m_status,
    x.m_base and x.m_type and x.m_sector and x.m_value and x.m_loc and x.m_role and x.m_size and x.m_funding and x.m_has and x.m_status,
    x.m_base and x.m_type and x.m_stage and x.m_value and x.m_loc and x.m_role and x.m_size and x.m_funding and x.m_has and x.m_status,
    x.m_base and x.m_type and x.m_stage and x.m_sector and x.m_loc and x.m_role and x.m_size and x.m_funding and x.m_has and x.m_status,
    x.m_base and x.m_type and x.m_stage and x.m_sector and x.m_value and x.m_role and x.m_size and x.m_funding and x.m_has and x.m_status,
    x.m_base and x.m_type and x.m_stage and x.m_sector and x.m_value and x.m_loc and x.m_size and x.m_funding and x.m_has and x.m_status,
    x.m_base and x.m_type and x.m_stage and x.m_sector and x.m_value and x.m_loc and x.m_role and x.m_funding and x.m_has and x.m_status,
    x.m_base and x.m_type and x.m_stage and x.m_sector and x.m_value and x.m_loc and x.m_role and x.m_size and x.m_has and x.m_status,
    x.m_base and x.m_type and x.m_stage and x.m_sector and x.m_value and x.m_loc and x.m_role and x.m_size and x.m_funding and x.m_status,
    x.m_base and x.m_type and x.m_stage and x.m_sector and x.m_value and x.m_loc and x.m_role and x.m_size and x.m_funding and x.m_has
  from flagged x;
$$;

-- One page, sorted, with wide fields fetched only for the rows on it. p_unmask is for exports.
create or replace function private.search_page(
  p_filters jsonb, p_sort text, p_dir text, p_limit integer, p_offset integer, p_uid uuid, p_unmask boolean
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with d as (
    select d.* from private.investor_directory(coalesce(p_filters, '{}'), p_uid) d where d.m_all
  ),
  -- One per firm keeps each firm's best-fit person.
  k as (
    select d.* from d where not coalesce((p_filters ->> 'one_per_firm')::boolean, false)
    union all
    (
      select distinct on (d.firm_key) d.* from d
      where coalesce((p_filters ->> 'one_per_firm')::boolean, false)
      order by d.firm_key, d.score desc, d.role_rank, d.full_name
    )
  ),
  ranked as (
    select k.id, k.score, k.sector_hit, k.stage_hit, k.kw_hits, k.country_hit, k.region_hit, k.value_hit, k.role,
      k.saved, k.contacted, k.replied, k.opened, k.queued, k.unlocked, k.pick_rank, k.pick_fit, k.pick_why,
      k.has_mobile, k.has_direct, k.has_phone, k.has_linkedin, k.has_twitter,
      row_number() over (order by
        case when p_sort = 'match' and p_dir = 'asc' then k.score end asc,
        case when p_sort = 'match' and p_dir <> 'asc' then k.score end desc,
        case when p_sort = 'name' and p_dir = 'asc' then k.full_name end asc,
        case when p_sort = 'name' and p_dir <> 'asc' then k.full_name end desc,
        case when p_sort = 'firm' and p_dir = 'asc' then k.firm end asc,
        case when p_sort = 'firm' and p_dir <> 'asc' then k.firm end desc,
        case when p_sort = 'location' and p_dir = 'asc' then concat_ws(' ', k.country, k.city) end asc,
        case when p_sort = 'location' and p_dir <> 'asc' then concat_ws(' ', k.country, k.city) end desc,
        case when p_sort = 'size' and p_dir = 'asc' then k.firm_employees end asc nulls last,
        case when p_sort = 'size' and p_dir <> 'asc' then k.firm_employees end desc nulls last,
        case when p_sort = 'funding' and p_dir = 'asc' then k.firm_funding end asc nulls last,
        case when p_sort = 'funding' and p_dir <> 'asc' then k.firm_funding end desc nulls last,
        case when p_sort = 'founded' and p_dir = 'asc' then k.firm_founded end asc nulls last,
        case when p_sort = 'founded' and p_dir <> 'asc' then k.firm_founded end desc nulls last,
        case when p_sort = 'picks' then coalesce(k.pick_rank, 100000) end asc,
        k.score desc, k.role_rank, k.full_name, k.id
      ) as rn
    from k
  ),
  page as (
    select r.* from ranked r where r.rn > greatest(p_offset, 0) and r.rn <= greatest(p_offset, 0) + greatest(p_limit, 0)
  ),
  s as (
    select coalesce(st.sectors, '{}') as sectors, coalesce(st."values", '{}') as vals, st.stage
    from (select 1) one left join public.startups st on st.owner_id = p_uid
  ),
  rows as (
    select pg.rn, jsonb_build_object(
      'id', i.id, 'full_name', i.full_name, 'first_name', i.first_name, 'last_name', i.last_name, 'title', i.title,
      'role', i.role, 'firm', i.firm, 'firm_domain', i.firm_domain,
      'email', case when p_unmask or pg.unlocked or i.source <> 'contacts' then i.email else private.mask_email(i.email) end,
      'phone', case when p_unmask or pg.unlocked or i.source <> 'contacts' then i.phone end,
      'mobile', case when p_unmask or pg.unlocked or i.source <> 'contacts' then i.mobile end,
      'direct_phone', case when p_unmask or pg.unlocked or i.source <> 'contacts' then i.direct_phone end,
      'linkedin_url', case when p_unmask or pg.unlocked or i.source <> 'contacts' then i.linkedin_url end,
      'twitter_url', case when p_unmask or pg.unlocked or i.source <> 'contacts' then i.twitter_url end,
      'has_mobile', pg.has_mobile, 'has_direct', pg.has_direct, 'has_phone', pg.has_phone,
      'has_linkedin', pg.has_linkedin, 'has_twitter', pg.has_twitter,
      'do_not_call', i.do_not_call, 'city', i.city, 'state', i.state, 'country', i.country, 'region', i.region,
      'location', i.location, 'investor_type', i.investor_type, 'stages', i.stages, 'sectors', i.sectors, 'values', i."values",
      'firm_employees', i.firm_employees, 'firm_funding', i.firm_funding, 'firm_founded', i.firm_founded,
      'website_url', i.website_url, 'source', i.source, 'score', pg.score,
      'reasons', to_jsonb(array_remove(array[
        case when pg.sector_hit then 'sector:' || array_to_string(array(select x from unnest(i.sectors) x where x = any (s.sectors)), ',') end,
        case when pg.stage_hit then 'stage:' || s.stage end,
        case when cardinality(pg.kw_hits) > 0 then 'keywords:' || (
          select string_agg(kk.keyword, ',') from (select k.keyword from private.keyword_ids k where k.id = any (pg.kw_hits) limit 3) kk
        ) end,
        case when pg.country_hit then 'country:' || i.country when pg.region_hit then 'region:' || i.region end,
        case when pg.value_hit then 'values:' || array_to_string(array(select x from unnest(i."values") x where x = any (s.vals)), ',') end,
        case when pg.role in ('partner', 'angel', 'principal') then 'role:' || pg.role end
      ], null)),
      'saved', pg.saved, 'contacted', pg.contacted, 'replied', pg.replied, 'opened', pg.opened, 'queued', pg.queued,
      'unlocked', p_unmask or pg.unlocked or i.source <> 'contacts',
      'pick_rank', pg.pick_rank, 'pick_fit', pg.pick_fit, 'pick_why', pg.pick_why
    ) as row
    from page pg
    join public.investors i on i.id = pg.id
    cross join s
  )
  select jsonb_build_object(
    'total', (select count(*) from k),
    'rows', coalesce((select jsonb_agg(r.row order by r.rn) from rows r), '[]'::jsonb)
  );
$$;

-- 5. Public, metered entry points -------------------------------------------------------------

create or replace function public.search_investors(
  p_filters jsonb default '{}',
  p_sort text default 'match',
  p_dir text default 'desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e record;
  lim integer;
  off integer := greatest(coalesce(p_offset, 0), 0);
  result jsonb;
  shown integer;
begin
  if uid is null then raise exception 'not_signed_in: Log in to search investors.' using errcode = 'P0001'; end if;
  select * into e from private.entitlements(uid);
  perform private.check_rate(uid, e.searches_per_minute);
  if e.rows_viewed_today >= e.daily_row_views then
    raise exception 'daily_limit: You have viewed % investors today, the most your plan allows. It resets at midnight UTC.', e.daily_row_views
      using errcode = 'P0001';
  end if;

  lim := least(greatest(coalesce(p_limit, 50), 1), e.page_size_max);
  if e.max_rows is not null then
    if off >= e.max_rows then
      raise exception 'page_limit: Your plan shows the first % results for any search. Narrow the filters or upgrade to see more.', e.max_rows
        using errcode = 'P0001';
    end if;
    lim := least(lim, e.max_rows - off);
  end if;

  result := private.search_page(p_filters, p_sort, p_dir, lim, off, uid, false);
  shown := jsonb_array_length(result -> 'rows');
  insert into private.search_usage as u (owner_id, day, rows_viewed) values (uid, current_date, shown)
  on conflict (owner_id, day) do update set rows_viewed = u.rows_viewed + excluded.rows_viewed;

  return result || jsonb_build_object('limits', jsonb_build_object('max_rows', e.max_rows, 'page_size', e.page_size_max, 'plan', e.plan_id));
end;
$$;

create or replace function public.investor_facets(p_filters jsonb default '{}')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e record;
  result jsonb;
begin
  if uid is null then raise exception 'not_signed_in: Log in to search investors.' using errcode = 'P0001'; end if;
  select * into e from private.entitlements(uid);
  perform private.check_rate(uid, e.searches_per_minute);

  with d as materialized (select * from private.investor_directory(coalesce(p_filters, '{}'), uid))
  select jsonb_build_object(
    'total', (select count(*) from d where m_all),
    'types', (select coalesce(jsonb_object_agg(investor_type, n), '{}') from (select investor_type, count(*) n from d where ex_type group by 1) x),
    'stages', (select coalesce(jsonb_object_agg(v, n), '{}') from (select v, count(*) n from d, unnest(stages) v where ex_stage group by 1) x),
    'sectors', (select coalesce(jsonb_object_agg(v, n), '{}') from (select v, count(*) n from d, unnest(sectors) v where ex_sector group by 1) x),
    'values', (select coalesce(jsonb_object_agg(v, n), '{}') from (select v, count(*) n from d, unnest(vals) v where ex_value group by 1) x),
    'regions', (select coalesce(jsonb_object_agg(region, n), '{}') from (select region, count(*) n from d where ex_loc and region is not null group by 1) x),
    'countries', (
      select coalesce(jsonb_object_agg(country, n), '{}')
      from (select country, count(*) n from d where ex_loc and country is not null group by 1 order by 2 desc limit 80) x
    ),
    'cities', (
      select coalesce(jsonb_object_agg(city, n), '{}')
      from (select city, count(*) n from d where ex_loc and city is not null group by 1 order by 2 desc limit 80) x
    ),
    'roles', (select coalesce(jsonb_object_agg(role, n), '{}') from (select role, count(*) n from d where ex_role group by 1) x),
    'firm_size', (
      select coalesce(jsonb_object_agg(b, n), '{}') from (
        select case
          when firm_employees <= 10 then '1_10' when firm_employees <= 50 then '11_50' when firm_employees <= 200 then '51_200'
          when firm_employees <= 1000 then '201_1000' else '1000_plus' end b, count(*) n
        from d where ex_size and firm_employees is not null group by 1
      ) x
    ),
    'firm_funding', (
      select coalesce(jsonb_object_agg(b, n), '{}') from (
        select case
          when firm_funding < 50000000 then 'under_50m' when firm_funding < 250000000 then '50_250m'
          when firm_funding < 1000000000 then '250m_1b' else '1b_plus' end b, count(*) n
        from d where ex_funding and firm_funding is not null group by 1
      ) x
    ),
    'has', (
      select jsonb_build_object(
        'mobile', count(*) filter (where has_mobile),
        'direct', count(*) filter (where has_direct),
        'any_phone', count(*) filter (where has_phone),
        'linkedin', count(*) filter (where has_linkedin),
        'twitter', count(*) filter (where has_twitter),
        'firm_phone', count(*) filter (where has_firm_phone),
        'website', count(*) filter (where has_website)
      ) from d where ex_has
    ),
    'status', (
      select jsonb_build_object(
        'any', count(*),
        'new', count(*) filter (where not contacted and not queued),
        'queued', count(*) filter (where queued),
        'contacted', count(*) filter (where contacted),
        'opened', count(*) filter (where opened),
        'replied', count(*) filter (where replied),
        'no_reply', count(*) filter (where contacted and not replied)
      ) from d where ex_status
    ),
    'saved', (select count(*) from d where m_all and saved),
    'picks', (select count(*) from d where m_all and pick_rank is not null)
  ) into result;
  return result;
end;
$$;

-- The drawer: firm details and keywords for anyone; contact details only once revealed.
create or replace function public.investor_detail(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e record;
  i public.investors;
  open boolean;
begin
  if uid is null then raise exception 'not_signed_in: Log in to view investors.' using errcode = 'P0001'; end if;
  select * into e from private.entitlements(uid);
  perform private.check_rate(uid, e.searches_per_minute);
  select * into i from public.investors x where x.id = p_id and x.active;
  if i.id is null then raise exception 'not_found: This investor is no longer in the directory.' using errcode = 'P0001'; end if;
  open := i.source <> 'contacts' or exists (select 1 from public.investor_unlocks u where u.owner_id = uid and u.investor_id = p_id);
  return jsonb_build_object(
    'headline', i.headline, 'keywords', to_jsonb(i.keywords), 'thesis', i.thesis, 'firm_description', i.firm_description,
    'firm_linkedin', i.firm_linkedin, 'firm_twitter', i.firm_twitter, 'firm_phone', i.firm_phone, 'firm_address', i.firm_address,
    'portfolio', to_jsonb(i.portfolio), 'focus_note', i.focus_note, 'unlocked', open,
    'contact', case when open then jsonb_build_object(
      'email', i.email, 'phone', i.phone, 'mobile', i.mobile, 'direct_phone', i.direct_phone,
      'linkedin_url', i.linkedin_url, 'twitter_url', i.twitter_url
    ) else null end
  );
end;
$$;

-- Spends one reveal credit (never twice for the same investor) and returns full contact details.
create or replace function public.reveal_investor(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e record;
  i public.investors;
begin
  if uid is null then raise exception 'not_signed_in: Log in to reveal contact details.' using errcode = 'P0001'; end if;
  select * into i from public.investors x where x.id = p_id and x.active;
  if i.id is null then raise exception 'not_found: This investor is no longer in the directory.' using errcode = 'P0001'; end if;
  if i.source = 'contacts' and not exists (select 1 from public.investor_unlocks u where u.owner_id = uid and u.investor_id = p_id) then
    select * into e from private.entitlements(uid);
    perform private.check_rate(uid, e.searches_per_minute);
    if e.reveals_left <= 0 then
      raise exception 'no_reveals: You have used all % contact reveals in this period. Upgrade for more.', e.reveals_total using errcode = 'P0001';
    end if;
    insert into public.investor_unlocks (owner_id, investor_id, source) values (uid, p_id, 'reveal') on conflict do nothing;
  end if;
  return jsonb_build_object(
    'email', i.email, 'phone', i.phone, 'mobile', i.mobile, 'direct_phone', i.direct_phone,
    'linkedin_url', i.linkedin_url, 'twitter_url', i.twitter_url
  );
end;
$$;

-- Exports up to 1,000 rows per call with full contact details. Each row not already unlocked costs
-- one export credit; the file stops where the credits run out. Every export is logged.
create or replace function public.export_investors(
  p_filters jsonb default '{}',
  p_sort text default 'match',
  p_dir text default 'desc',
  p_limit integer default 1000,
  p_offset integer default 0
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e record;
  page jsonb;
  picked jsonb;
  ids uuid[];
  charged integer;
begin
  if uid is null then raise exception 'not_signed_in: Log in to export.' using errcode = 'P0001'; end if;
  select * into e from private.entitlements(uid);
  if e.exports_total = 0 then
    raise exception 'export_locked: Exports are not included in the free trial. Upgrade to export investors.' using errcode = 'P0001';
  end if;
  perform private.check_rate(uid, e.searches_per_minute);
  if e.exports_left <= 0 then
    raise exception 'no_exports: You have used all % export credits in this period.', e.exports_total using errcode = 'P0001';
  end if;

  page := private.search_page(p_filters, p_sort, p_dir, least(greatest(coalesce(p_limit, 1000), 1), 1000), greatest(coalesce(p_offset, 0), 0), uid, true);

  -- Keep rows in order until the new (not yet unlocked) ones would exceed the credits left.
  with r as (
    select v, o, (select count(*) from public.investor_unlocks u where u.owner_id = uid and u.investor_id = (v ->> 'id')::uuid) = 0 as fresh
    from jsonb_array_elements(page -> 'rows') with ordinality as t(v, o)
  ),
  c as (select v, o, fresh, sum(fresh::int) over (order by o) as spent from r)
  select coalesce(jsonb_agg(v order by o), '[]'::jsonb), coalesce(array_agg((v ->> 'id')::uuid), '{}'), coalesce(sum(fresh::int), 0)
  into picked, ids, charged
  from c where spent <= e.exports_left;

  insert into public.investor_unlocks (owner_id, investor_id, source)
  select uid, x, 'export' from unnest(ids) x on conflict do nothing;
  insert into public.export_log (owner_id, rows_exported, credits, investor_ids, filters)
  values (uid, jsonb_array_length(picked), charged, ids, coalesce(p_filters, '{}'));

  return jsonb_build_object('total', page -> 'total', 'rows', picked, 'charged', charged, 'exports_left', e.exports_left - charged);
end;
$$;

-- The founder's plan, limits and usage, for the billing page and in-app meters.
create or replace function public.my_entitlements()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(e) from private.entitlements(auth.uid()) e;
$$;

create or replace function public.directory_size()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from private.investor_index;
$$;

revoke all on function private.investor_directory(jsonb, uuid) from public, anon, authenticated;
revoke all on function private.search_page(jsonb, text, text, integer, integer, uuid, boolean) from public, anon, authenticated;
revoke all on function private.entitlements(uuid) from public, anon, authenticated;
revoke all on function private.check_rate(uuid, integer) from public, anon, authenticated;
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.search_investors(jsonb, text, text, integer, integer)', 'public.investor_facets(jsonb)', 'public.investor_detail(uuid)',
    'public.reveal_investor(uuid)', 'public.export_investors(jsonb, text, text, integer, integer)', 'public.my_entitlements()',
    'public.directory_size()'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- 6. Lock the tables ----------------------------------------------------------------------------

-- The raw import is never readable from the API.
revoke all on public.contacts from anon, authenticated;

-- Investors: names and firms only, and only for investors the founder already works with.
drop policy if exists "investors readable" on public.investors;
revoke select on public.investors from anon, authenticated;
grant select (id, full_name, first_name, last_name, title, role, firm, firm_domain, investor_type, location, city, country, region, source)
  on public.investors to authenticated;
create policy "investors you work with" on public.investors for select to authenticated using (
  exists (select 1 from public.saved_investors s where s.investor_id = investors.id and s.owner_id = (select auth.uid()))
  or exists (select 1 from public.outreach_messages o where o.investor_id = investors.id and o.owner_id = (select auth.uid()))
  or exists (select 1 from public.scheduled_emails e where e.investor_id = investors.id and e.owner_id = (select auth.uid()))
  or exists (select 1 from public.investor_matches m where m.investor_id = investors.id and m.owner_id = (select auth.uid()))
  or exists (select 1 from public.investor_unlocks u where u.investor_id = investors.id and u.owner_id = (select auth.uid()))
);

-- 7. Sync rules ---------------------------------------------------------------------------------

-- Contacts without a LinkedIn profile leave the directory, and the keyword vocabulary is counted from
-- the index (sampled above 50,000 investors so the job stays inside the statement timeout).
create or replace function private.finish_investor_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  pct numeric;
begin
  update public.investors x set active = false
  where x.source = 'contacts' and x.active
    and (x.linkedin_url is null or not exists (select 1 from public.contacts c where lower(trim(c.email)) = lower(x.email)));

  select count(*) into n from private.investor_index;
  pct := least(100, greatest(1, 5000000.0 / greatest(n, 1)));
  delete from public.investor_keywords;
  if n <= 50000 then
    insert into public.investor_keywords (keyword, df)
    select k.keyword, count(*) from private.investor_index x, unnest(x.kw) kid join private.keyword_ids k on k.id = kid
    group by k.keyword having count(*) >= 3;
  else
    insert into public.investor_keywords (keyword, df)
    select k.keyword, round(count(*) * 100 / pct)::int
    from private.investor_index x tablesample system (pct), unnest(x.kw) kid join private.keyword_ids k on k.id = kid
    group by k.keyword having count(*) * 100 / pct >= 3;
  end if;
end;
$$;
revoke all on function private.finish_investor_sync() from public, anon, authenticated;

-- New contacts need both an email and a LinkedIn profile to enter the directory.
do $do$
declare def text;
begin
  select pg_get_functiondef('private.sync_investors_from_contacts(integer)'::regprocedure) into def;
  def := replace(def, $a$    where c.email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'
$a$, $b$    where c.email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'
      -- Email and LinkedIn are both required.
      and coalesce(trim(c.linkedin_url), '') <> ''
$b$);
  if position('Email and LinkedIn are both required' in def) = 0 then raise exception 'sync rewrite did not apply'; end if;
  execute def;
end $do$;

-- 8. Performance, measured on the live directory ---------------------------------------------------
-- Applied in this order; each step rewrites the functions above in place.

-- a) The directory query is plain SQL (no SECURITY DEFINER, no SET) so it inlines into its callers.
--    Only the definer entry points can reach it. JIT is off: compiling cost more than it saved.
do $do$
declare def text;
begin
  select pg_get_functiondef('private.investor_directory(jsonb, uuid)'::regprocedure) into def;
  def := replace(def, ' SECURITY DEFINER', '');
  def := replace(def, E' SET search_path TO \'\'', '');
  execute def;
end $do$;
revoke all on function private.investor_directory(jsonb, uuid) from public, anon, authenticated;
alter function private.search_page(jsonb, text, text, integer, integer, uuid, boolean) set jit = off;
alter function public.search_investors(jsonb, text, text, integer, integer) set jit = off;
alter function public.investor_facets(jsonb) set jit = off;
alter function public.export_investors(jsonb, text, text, integer, integer) set jit = off;

-- b) Page and facet queries run through EXECUTE ... USING, which plans each call with the actual filter
--    values. A cached generic plan cannot see which filters are empty and was around eight times slower.
do $do$
declare
  def text;
  head text;
  body text;
begin
  select pg_get_functiondef('private.search_page(jsonb, text, text, integer, integer, uuid, boolean)'::regprocedure) into def;
  def := replace(def, 'LANGUAGE sql', 'LANGUAGE plpgsql');
  head := substring(def from '^(.*?AS \$function\$)');
  body := substring(def from 'AS \$function\$(.*)\$function\$');
  body := regexp_replace(body, ';\s*$', '');
  body := regexp_replace(body, '\mp_filters\M', '$1', 'g');
  body := regexp_replace(body, '\mp_sort\M', '$2', 'g');
  body := regexp_replace(body, '\mp_dir\M', '$3', 'g');
  body := regexp_replace(body, '\mp_limit\M', '$4', 'g');
  body := regexp_replace(body, '\mp_offset\M', '$5', 'g');
  body := regexp_replace(body, '\mp_uid\M', '$6', 'g');
  body := regexp_replace(body, '\mp_unmask\M', '$7', 'g');
  -- Only the columns a page needs, so facet flags and arrays are never computed for a search.
  body := replace(body, 'select d.* from private.investor_directory(',
    'select d.id, d.score, d.sector_hit, d.stage_hit, d.kw_hits, d.country_hit, d.region_hit, d.value_hit, d.role, d.role_rank, '
    || 'd.firm_key, d.full_name, d.firm, d.country, d.city, d.firm_employees, d.firm_funding, d.firm_founded, d.saved, d.contacted, '
    || 'd.replied, d.opened, d.queued, d.unlocked, d.pick_rank, d.pick_fit, d.pick_why, d.has_mobile, d.has_direct, d.has_phone, '
    || 'd.has_linkedin, d.has_twitter from private.investor_directory(');
  execute head || E'\ndeclare\n  result jsonb;\nbegin\n  execute $q$' || body
    || E'$q$\n  into result\n  using p_filters, p_sort, p_dir, p_limit, p_offset, p_uid, p_unmask;\n  return result;\nend;\n$function$';

  select pg_get_functiondef('public.investor_facets(jsonb)'::regprocedure) into def;
  def := replace(def, '  with d as materialized', '  execute $q$ with d as materialized');
  def := replace(def, 'private.investor_directory(coalesce(p_filters, ''{}''), uid)', 'private.investor_directory(coalesce($1, ''{}''), $2)');
  def := replace(def, '  ) into result;', '  ) $q$ into result using p_filters, uid;');
  execute def;
end $do$;

-- c) Free-text search matches every word against name, firm, domain, city, country or the investor's
--    keywords, all on the slim index. The wide full-text vector was too slow for common words. Keyword
--    arrays use intarray's sorted operators, which are far faster than the generic array ones.
create extension if not exists pg_trgm with schema extensions;
create index if not exists keyword_ids_trgm on private.keyword_ids using gin (keyword extensions.gin_trgm_ops);
do $do$
declare def text;
begin
  select pg_get_functiondef('private.investor_directory(jsonb, uuid)'::regprocedure) into def;
  def := replace(def, $a$  qhits as (
    select i.id from public.investors i, f
    where f.q is not null and i.active and i.search @@ websearch_to_tsquery('english', f.q)
  ),$a$, $b$  qwords as materialized (
    select w as word, '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
      coalesce((
        select array_agg(k.id) from private.keyword_ids k
        where k.keyword ilike ('%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      ), '{}') as ids
    from f, unnest(regexp_split_to_array(lower(f.q), '\s+')) as w
    where f.q is not null and w <> ''
  ),$b$);
  def := replace(def, $a$        case when f.q is null then true
             else sc.full_name ilike f.qlike or sc.firm ilike f.qlike or sc.firm_key ilike f.qlike or sc.id in (select qh.id from qhits qh) end$a$,
    $b$        case when f.q is null then true
             else not exists (
               select 1 from qwords w
               where not (sc.full_name ilike w.pat or sc.firm ilike w.pat or sc.firm_key ilike w.pat
                          or coalesce(sc.city, '') ilike w.pat or coalesce(sc.country, '') ilike w.pat or sc.kw && w.ids)
             ) end$b$);
  def := replace(def, 'sc.kw && w.ids', 'sc.kw operator(extensions.&&) w.ids');
  def := replace(def, 'sc.kw @> fk.kw_ids', 'sc.kw operator(extensions.@>) fk.kw_ids');
  def := replace(def, 'else sc.kw && fk.kw_ids end', 'else sc.kw operator(extensions.&&) fk.kw_ids end');
  def := replace(def, 'not (sc.kw && fk.kw_not_ids)', 'not (sc.kw operator(extensions.&&) fk.kw_not_ids)');
  execute def;
end $do$;
revoke all on function private.investor_directory(jsonb, uuid) from public, anon, authenticated;

-- d) Sorting and faceting the whole directory needs more than the 2MB default before it spills to disk.
alter function private.search_page(jsonb, text, text, integer, integer, uuid, boolean) set work_mem = '64MB';
alter function public.investor_facets(jsonb) set work_mem = '64MB';

-- e) An explicit list of investor ids, for exporting a hand-picked selection.
do $do$
declare def text;
begin
  select pg_get_functiondef('private.investor_directory(jsonb, uuid)'::regprocedure) into def;
  def := replace(def, $a$      coalesce(nullif(p ->> 'min_score', '')::int, 0) as min_score
  ),$a$, $b$      coalesce(nullif(p ->> 'min_score', '')::int, 0) as min_score,
      coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'ids') = 'array' then p -> 'ids' else '[]'::jsonb end) x), '{}') as ids
  ),$b$);
  def := replace(def, $a$        and sc.score >= f.min_score$a$, $b$        and sc.score >= f.min_score
        and (cardinality(f.ids) = 0 or sc.id = any (f.ids))$b$);
  execute def;
end $do$;
revoke all on function private.investor_directory(jsonb, uuid) from public, anon, authenticated;
