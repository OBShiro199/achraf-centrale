-- Real investor directory. public.contacts is the raw import; it is synced into public.investors,
-- one row per email, with type, stages, sectors, values, role, region and phones derived from the
-- data. Existing foreign keys (saved, outreach, outbox) keep pointing at public.investors.

-- 1. Directory fields on investors ------------------------------------------------------------
alter table public.investors drop constraint if exists investors_investor_type_check;
alter table public.investors add constraint investors_investor_type_check
  check (investor_type in ('vc', 'angel', 'family_office', 'accelerator', 'cvc', 'pe'));

alter table public.investors
  add column source text not null default 'demo' check (source in ('demo', 'test', 'contacts')),
  add column active boolean not null default true,
  add column contact_id bigint unique,
  add column first_name text,
  add column last_name text,
  add column headline text,
  add column seniority text,
  add column role text not null default 'other' check (role in (
    'partner', 'principal', 'associate', 'angel', 'venture_partner', 'operating', 'investor_relations', 'lp', 'other'
  )),
  add column keywords text[] not null default '{}',
  add column city text,
  add column state text,
  add column country text,
  add column region text,
  add column mobile text,
  add column direct_phone text,
  add column phone_raw text,
  add column do_not_call boolean not null default false,
  add column twitter_url text,
  add column firm_domain text,
  add column firm_linkedin text,
  add column firm_twitter text,
  add column firm_phone text,
  add column firm_employees integer,
  add column firm_founded smallint,
  add column firm_revenue bigint,
  add column firm_funding bigint,
  add column firm_description text,
  add column firm_address text,
  add column firm_city text,
  add column firm_country text,
  add column synced_at timestamptz,
  add column sync_hash text,
  add column search tsvector;

create unique index investors_email_lower on public.investors (lower(email));
create index if not exists contacts_email_lower_idx on public.contacts (lower(trim(email)));
create index investors_keywords_gin on public.investors using gin (keywords);
create index investors_search_gin on public.investors using gin (search);
create index investors_active_idx on public.investors (active, source);

-- Full-text search vector, kept current on every write.
create or replace function private.investors_search_tg()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search :=
    setweight(to_tsvector('english', concat_ws(' ', new.full_name, new.firm)), 'A')
    || setweight(to_tsvector('english', concat_ws(' ', new.title, new.headline, new.firm_domain)), 'B')
    || setweight(to_tsvector('english', concat_ws(' ', array_to_string(new.keywords, ' '), array_to_string(new.portfolio, ' '))), 'C')
    || setweight(to_tsvector('english', concat_ws(' ', new.thesis, new.firm_description, new.focus_note, new.city, new.country)), 'D');
  return new;
end;
$$;

create trigger investors_search before insert or update on public.investors
  for each row execute function private.investors_search_tg();

create or replace function private.region_of(p_country text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_country is null then null
    when p_country in ('United States', 'Puerto Rico') then 'US'
    when p_country in ('United Kingdom', 'Guernsey', 'Jersey', 'Isle of Man') then 'UK'
    when p_country = 'Canada' then 'Canada'
    when p_country in ('Israel', 'United Arab Emirates', 'Saudi Arabia', 'Lebanon', 'Jordan', 'Oman', 'Qatar', 'Bahrain', 'Kuwait', 'Turkey')
      then 'Middle East'
    when p_country in ('India', 'Singapore', 'Japan', 'China', 'Hong Kong', 'South Korea', 'Taiwan', 'Malaysia', 'Vietnam', 'Indonesia',
                       'Thailand', 'Philippines', 'Macau', 'Myanmar', 'Kazakhstan', 'Uzbekistan', 'Pakistan', 'Bangladesh', 'Sri Lanka')
      then 'Asia'
    when p_country in ('Australia', 'New Zealand', 'Micronesia') then 'Oceania'
    when p_country in ('Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Uruguay', 'Costa Rica', 'Guatemala', 'Ecuador', 'Panama')
      then 'Latin America'
    when p_country in ('Nigeria', 'Kenya', 'South Africa', 'Egypt', 'Morocco', 'Senegal', 'Uganda', 'Tanzania', 'Ghana', 'Rwanda', 'Ethiopia')
      then 'Africa'
    else 'Europe'
  end;
$$;

-- Demo investors leave the directory; the reply-testing contact stays.
update public.investors set
  source = case when firm = 'Centrale Test Desk' then 'test' else 'demo' end,
  active = (firm = 'Centrale Test Desk'),
  role = case
    when title ilike '%angel%' then 'angel'
    when title ~* 'partner|founding|head' then 'partner'
    when title ~* 'principal|director|manager' then 'principal'
    else 'associate' end,
  mobile = phone,
  city = nullif(trim(split_part(location, ',', 1)), ''),
  country = case substring(location from ',\s*([A-Z]{2})$')
    when 'UK' then 'United Kingdom' when 'US' then 'United States' when 'DE' then 'Germany' when 'PT' then 'Portugal'
    when 'FR' then 'France' when 'IT' then 'Italy' when 'NO' then 'Norway' when 'DK' then 'Denmark' when 'IE' then 'Ireland'
    else null end;
update public.investors set region = private.region_of(country) where source <> 'contacts';

-- Keyword vocabulary with document frequency: powers keyword filters, autocomplete and match weighting.
create table public.investor_keywords (
  keyword text primary key,
  df integer not null
);
alter table public.investor_keywords enable row level security;
create policy "keywords readable" on public.investor_keywords for select to authenticated using (true);
grant select on public.investor_keywords to authenticated;

-- 2. Sync from contacts -------------------------------------------------------------------------
-- Upserts up to p_limit new or changed contacts. Returns how many rows it wrote, so the caller
-- can keep going in committed batches until it returns less than p_limit.
create or replace function private.sync_investors_from_contacts(p_limit integer default 2000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  started timestamptz := clock_timestamp();
  affected integer;
begin
  with canon_all as (
    -- One row per email: prefer rows with a phone, then richer keywords, then the newest import.
    select distinct on (lower(trim(c.email))) c.*, lower(trim(c.email)) as email_key, md5(c::text) as row_hash
    from public.contacts c
    where c.email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'
    order by lower(trim(c.email)), (coalesce(c.mobile_number, '') <> '') desc, length(coalesce(c.keywords, '')) desc, c.id_un desc
  ),
  -- Only new or changed contacts go through derivation; unchanged rows are skipped entirely.
  canon as (
    select ca.* from canon_all ca
    where not exists (
      select 1 from public.investors x where lower(x.email) = ca.email_key and x.sync_hash = ca.row_hash and x.active
    )
    order by ca.email_key
    limit p_limit
  ),
  prepared as (
    select
      c.*,
      array(
        select k from (
          select trim(x) as k, min(ord) as o
          from unnest(string_to_array(lower(coalesce(c.keywords, '')), ',')) with ordinality as u(x, ord)
          where trim(x) <> ''
          group by trim(x)
        ) z order by o
      ) as kw,
      lower(concat_ws(' ', c.keywords, c.company_short_description, c.company_seo_description, c.headline)) as t,
      lower(concat_ws(' ', c.company_name, c.company_short_description, c.company_seo_description)) as ft,
      lower(coalesce(c.title, '')) as tl,
      case trim(c.country)
        when 'Czechia' then 'Czech Republic'
        when 'Republic of Indonesia' then 'Indonesia'
        when 'Republic of the Union of Myanmar' then 'Myanmar'
        else nullif(trim(c.country), '')
      end as country_norm
    from canon c
  ),
  typed as (
    select p.*,
      case
        when p.tl ~ '\mangel\M' or lower(coalesce(p.company_name, '')) ~ '(self[- ]employed|independent|angel invest|personal invest)' then 'angel'
        when p.ft ~ '\m(accelerator|incubator)\M' or lower(coalesce(p.company_name, '')) ~ '(techstars|y combinator|startup studio|venture studio)'
          then 'accelerator'
        when lower(coalesce(p.company_name, '')) ~ 'family office' or p.ft ~ '(\mis an? |(single|multi)[- ]?)family office' or 'family office' = any (p.kw)
          then 'family_office'
        when p.ft ~ '(corporate venture|venture arm|ventures arm|investment arm of|corporate vc)' or 'corporate venture capital' = any (p.kw) then 'cvc'
        when ((p.t ~ 'buyout')::int + (p.t ~ 'middle market')::int + (p.t ~ 'control[- ](investment|oriented)')::int + (p.t ~ 'recapitali')::int
              + (p.t ~ 'add-on acquisition')::int + (p.t ~ 'ebitda')::int) >= 2
             and not (p.t ~ '(\mseed\M|pre[- ]?seed|early[- ]stage|series a\M|startups?\M)')
          then 'pe'
        else 'vc'
      end as itype
    from prepared p
  ),
  derived as (
    select t.*,
      array_remove(array[
        case when t.t ~ 'pre[- ]?seed' then 'pre_seed' end,
        case when regexp_replace(t.t, 'pre[- ]?seed', '', 'g') ~ '\mseed\M' or t.t ~ 'early[- ]stage' then 'seed' end,
        case when t.itype = 'angel' or t.t ~ 'angel invest' then 'angel' end,
        case when t.t ~ '(series[- ]a\M|early[- ]stage)' then 'series_a' end,
        case when t.t ~ '(series[- ][b-e]\M|growth[- ]stage|growth equity|late[- ]stage|expansion[- ]stage)' then 'series_b' end
      ], null) as stages_d,
      array_remove(array[
        case when t.t ~ '(\msaas\M|enterprise software|b2b software|software as a service|vertical software|enterprise tech)' then 'b2b_saas' end,
        case when t.t ~ '(artificial intelligence|machine learning|\mai\M|generative ai|deep learning|\mllms?\M)' then 'ai_ml' end,
        case when t.t ~ '(fintech|financial technology|finance technology|payments|insurtech|embedded finance|regtech|wealthtech|\mlending\M|neobank)'
          then 'fintech' end,
        case when t.t ~ '(climate|clean ?tech|clean energy|renewable energy|decarboni|energy transition|\mcarbon\M|energy storage|circular economy)'
          then 'climate' end,
        case when t.t ~ '(health ?care|health ?tech|digital health|biotech|life sciences|\mmedical|medtech|pharma|diagnostics|therapeutics)' then 'health' end,
        case when t.t ~ '(\mconsumer|\md2c\M|\mb2c\M|direct[- ]to[- ]consumer)' then 'consumer' end,
        case when t.t ~ '(e-?commerce|\md2c\M|\mdtc\M|direct[- ]to[- ]consumer|online retail|retail tech)' then 'ecommerce' end,
        case when t.t ~ '(hardware|robotics|deep ?tech|semiconductor|\mmanufacturing|industrial automation|\miot\M|internet of things|advanced materials|space tech)'
          then 'hardware' end,
        case when t.t ~ 'marketplace' then 'marketplace' end,
        case when t.t ~ '(developer tools|devtools|developer platform|\mdevops\M|open[- ]source|dataops|mlops|cloud infrastructure)' then 'devtools' end,
        case when t.t ~ '(sales ?tech|martech|marketing technology|revenue operations|\mrevops\M|\mcrm\M|customer relationship management|adtech|sales enablement)'
          then 'gtm_sales' end,
        case when t.t ~ '(edtech|education technology|e-?learning|\meducation\M)' then 'edtech' end,
        case when t.t ~ '(proptech|real estate|property tech|construction tech|contech)' then 'proptech' end,
        case when t.t ~ '(\mfood|agtech|agritech|agri-?food|agricultur|farming|alternative protein)' then 'food_agri' end,
        case when t.t ~ '(logistics|supply chain|\mmobility\M|transportation|freight|\mfleet)' then 'logistics' end
      ], null) as sectors_d,
      array_remove(array[
        case when t.t ~ '(climate|\mesg\M|clean ?energy|clean ?tech|decarboni|circular economy|renewable|environmental impact|sustainable (investing|investment|finance))'
          then 'eco_friendly' end,
        case when t.t ~ '(impact invest|social impact|impact fund|social enterprise|impact measurement)' then 'social_impact' end,
        case when t.t ~ '(non-?profit|philanthrop|charit)' then 'charity' end,
        case when t.t ~ '(diversity|diverse founders|underrepresented|women founders|female founders|women-led|black founders)' then 'diversity' end,
        case when t.t ~ 'open[- ]source' then 'open_source' end,
        case when t.t ~ '(mental health|well-?being|digital health)' then 'health_wellbeing' end,
        case when t.t ~ '(edtech|e-?learning|\meducation\M)' then 'education' end,
        case when t.t ~ '(responsible ai|ethical ai|ai ethics|trustworthy ai|ai safety)' then 'ethical_ai' end,
        case when t.t ~ '(local communit|community development|community investment|local economy)' then 'local_community' end,
        case when t.t ~ '(\mb[- ]corp|certified b)' then 'b_corp' end
      ], null) as values_d,
      case
        when t.tl ~ '(investor relations|\mir\M|capital formation|fundrais|capital raising)' then 'investor_relations'
        when t.tl ~ '(limited partner|\mlp\M)' then 'lp'
        when t.tl ~ '(operating|operations partner|platform|talent|portfolio (operations|support|success)|community|marketing|executive partner|value creation)'
          then 'operating'
        when t.tl ~ '(venture partner|scout|entrepreneur in residence|\meir\M|advis)' then 'venture_partner'
        when t.tl ~ '\mangel\M' then 'angel'
        when t.tl ~ '(partner|managing director|founder|chief executive|\mceo\M|chief investment|\mcio\M|president|\mchair|managing member|\mgp\M)'
          then 'partner'
        when t.tl ~ '(principal|director|vice president|\mvp\M|head of|investment manager)' then 'principal'
        when t.tl ~ '(associate|analyst|intern|fellow)' then 'associate'
        when t.seniority in ('partner', 'founder', 'c_suite', 'owner') then 'partner'
        when t.seniority in ('director', 'vp', 'head') then 'principal'
        when t.tl ~ '(invest|\mvc\M|venture)' then 'associate'
        else 'other'
      end as role_d,
      -- DNC numbers arrive as "Hidden (Mobile, DNC)": flag the contact, never surface the number.
      ph.mobile_d, ph.direct_d, coalesce(t.mobile_number, '') ~* '\mdnc\M' as dnc
    from typed t
    left join lateral (
      -- "+1 201-669-8897 (Mobile), +1 212-847-8902 (Direct, DNC)". Numbers marked DNC are never surfaced.
      select
        (array_agg(n) filter (where l ilike 'mobile%' and l not ilike '%dnc%'))[1] as mobile_d,
        (array_agg(n) filter (where (l is null or l ilike 'direct%' or l ilike 'office%') and coalesce(l, '') not ilike '%dnc%'))[1] as direct_d
      from (
        select m[1] as n, m[2] as l
        from regexp_matches(coalesce(t.mobile_number, ''), '(\+?[0-9][0-9 .()-]{5,}[0-9])(?:\s*\(([A-Za-z, ]+)\))?', 'g') as m
      ) p
    ) ph on true
  )
  insert into public.investors as i (
    source, active, contact_id, email, first_name, last_name, full_name, title, headline, seniority, role,
    firm, investor_type, stages, sectors, "values", keywords, thesis, firm_description,
    city, state, country, region, location, phone, mobile, direct_phone, phone_raw, do_not_call,
    linkedin_url, twitter_url, website_url, firm_domain, firm_linkedin, firm_twitter, firm_phone,
    firm_employees, firm_founded, firm_revenue, firm_funding, firm_address, firm_city, firm_country, synced_at, sync_hash
  )
  select
    'contacts', true, d.id_un, d.email_key,
    nullif(trim(d.first_name), ''), nullif(trim(d.last_name), ''),
    coalesce(nullif(trim(concat_ws(' ', nullif(trim(d.first_name), ''), nullif(trim(d.last_name), ''))), ''), split_part(d.email_key, '@', 1)),
    nullif(trim(d.title), ''), nullif(trim(d.headline), ''), nullif(trim(d.seniority), ''), d.role_d,
    coalesce(nullif(trim(d.company_name), ''), nullif(trim(d.company_domain), ''), 'Independent'),
    d.itype, d.stages_d, d.sectors_d, d.values_d, d.kw,
    coalesce(nullif(trim(d.company_seo_description), ''), substring(d.company_short_description from '^[^.]{20,250}\.')),
    nullif(trim(d.company_short_description), ''),
    nullif(trim(d.city), ''), nullif(trim(d.state), ''), d.country_norm, private.region_of(d.country_norm),
    nullif(concat_ws(', ', nullif(trim(d.city), ''), d.country_norm), ''),
    coalesce(d.mobile_d, d.direct_d), d.mobile_d, d.direct_d, nullif(trim(d.mobile_number), ''), d.dnc,
    nullif(regexp_replace(trim(coalesce(d.linkedin_url, '')), '^http://', 'https://'), ''),
    nullif(regexp_replace(trim(coalesce(d.twitter_url, '')), '^http://', 'https://'), ''),
    nullif(regexp_replace(trim(coalesce(d.company_website, '')), '^http://', 'https://'), ''),
    nullif(lower(trim(d.company_domain)), ''),
    nullif(regexp_replace(trim(coalesce(d.company_linkedin, '')), '^http://', 'https://'), ''),
    nullif(regexp_replace(trim(coalesce(d.company_twitter, '')), '^http://', 'https://'), ''),
    nullif(trim(d.company_phone_number), ''),
    nullif(d.employees_count, 0), nullif(d.company_founded_year, 0), nullif(d.company_annual_revenue, 0), nullif(d.company_total_funding, 0),
    nullif(trim(d.company_raw_address), ''), nullif(trim(d.company_city), ''), nullif(trim(d.company_country), ''),
    started, d.row_hash
  from derived d
  on conflict ((lower(email))) do update set
    active = true, contact_id = excluded.contact_id, first_name = excluded.first_name, last_name = excluded.last_name,
    full_name = excluded.full_name, title = excluded.title, headline = excluded.headline, seniority = excluded.seniority,
    role = excluded.role, firm = excluded.firm, investor_type = excluded.investor_type, stages = excluded.stages,
    sectors = excluded.sectors, "values" = excluded."values", keywords = excluded.keywords, thesis = excluded.thesis,
    firm_description = excluded.firm_description, city = excluded.city, state = excluded.state, country = excluded.country,
    region = excluded.region, location = excluded.location, phone = excluded.phone, mobile = excluded.mobile,
    direct_phone = excluded.direct_phone, phone_raw = excluded.phone_raw, do_not_call = excluded.do_not_call,
    linkedin_url = excluded.linkedin_url, twitter_url = excluded.twitter_url, website_url = excluded.website_url,
    firm_domain = excluded.firm_domain, firm_linkedin = excluded.firm_linkedin, firm_twitter = excluded.firm_twitter,
    firm_phone = excluded.firm_phone, firm_employees = excluded.firm_employees, firm_founded = excluded.firm_founded,
    firm_revenue = excluded.firm_revenue, firm_funding = excluded.firm_funding, firm_address = excluded.firm_address,
    firm_city = excluded.firm_city, firm_country = excluded.firm_country, synced_at = excluded.synced_at,
    sync_hash = excluded.sync_hash
  where i.source = 'contacts';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Removes contacts that left the import and rebuilds the keyword vocabulary.
create or replace function private.finish_investor_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- History that references a removed investor is kept; they just leave the directory.
  update public.investors x set active = false
  where x.source = 'contacts' and x.active
    and not exists (select 1 from public.contacts c where lower(trim(c.email)) = lower(x.email));

  delete from public.investor_keywords;
  insert into public.investor_keywords (keyword, df)
  select k, count(*) from public.investors i, unnest(i.keywords) k
  where i.active and i.source = 'contacts'
  group by k having count(*) >= 3;
end;
$$;

-- Re-sync only when the contacts table has changed since the last run.
create table private.sync_state (
  key text primary key,
  value bigint,
  synced_at timestamptz
);

-- One batch per call, run every minute by pg_cron, so a large import never hits the statement
-- timeout. The change counter is only recorded once a batch comes back short, meaning caught up.
create or replace function private.sync_investors_step()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_changes bigint;
  last_changes bigint;
  written integer;
begin
  select n_tup_ins + n_tup_upd + n_tup_del into current_changes from pg_stat_user_tables where relid = 'public.contacts'::regclass;
  select value into last_changes from private.sync_state where key = 'contacts';
  if current_changes is not distinct from last_changes then return 'unchanged'; end if;

  written := private.sync_investors_from_contacts(2000);
  if written = 2000 then return 'batch of 2000, more to come'; end if;

  perform private.finish_investor_sync();
  insert into private.sync_state (key, value, synced_at) values ('contacts', current_changes, now())
  on conflict (key) do update set value = excluded.value, synced_at = excluded.synced_at;
  return format('caught up, %s written', written);
end;
$$;

revoke all on function private.sync_investors_from_contacts(integer) from public, anon, authenticated;
revoke all on function private.finish_investor_sync() from public, anon, authenticated;
revoke all on function private.sync_investors_step() from public, anon, authenticated;

-- 3. Matching state on startups and Claude's shortlist ----------------------------------------
alter table public.startups
  add column match_keywords text[] not null default '{}',
  add column country text,
  add column matches_status text not null default 'idle' check (matches_status in ('idle', 'running', 'done', 'error')),
  add column matched_at timestamptz;

create table public.investor_matches (
  owner_id uuid not null references auth.users (id) on delete cascade,
  investor_id uuid not null references public.investors (id) on delete cascade,
  rank integer not null,
  fit integer not null check (fit between 1 and 5),
  why text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, investor_id)
);
create index investor_matches_investor_idx on public.investor_matches (investor_id);
alter table public.investor_matches enable row level security;
create policy "own matches read" on public.investor_matches for select to authenticated using ((select auth.uid()) = owner_id);
grant select on public.investor_matches to authenticated;

-- 4. Directory query: one pass computes fit score and a flag per filter group -----------------
create or replace function private.jarr(j jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end)), '{}');
$$;

-- Filter logic: AND across groups, OR within a group. Keywords can be any or all; excluded keywords
-- never match. Location (regions, countries, cities) is one group. Each ex_<group> flag is every
-- other group's result, used for facet counts that stay correct while that group is being edited.
create or replace function private.investor_directory(p jsonb)
returns table (
  id uuid, score integer, reasons text[], role_rank integer,
  saved boolean, contacted boolean, replied boolean, opened boolean, queued boolean,
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
      case when nullif(trim(p ->> 'q'), '') is not null then websearch_to_tsquery('english', p ->> 'q') end as tsq,
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
  s as (
    select
      coalesce(st.sectors, '{}') as sectors,
      st.stage,
      coalesce(st.investor_types, '{}') as investor_types,
      coalesce(st."values", '{}') as vals,
      st.country,
      private.region_of(st.country) as region,
      array(
        select distinct lower(x) from unnest(coalesce(st.match_keywords, '{}') || coalesce(st.keywords, '{}')) x
      ) as terms
    from (select 1) one
    left join public.startups st on st.owner_id = (select auth.uid())
  ),
  total as (select greatest(count(*), 1)::numeric as n from public.investors where active),
  terms as (
    select k.keyword, ln((select n from total) / k.df) as w
    from s cross join lateral unnest(s.terms) as u(term)
    join public.investor_keywords k on k.keyword = u.term
    where k.df <= (select n from total) * 0.25
  ),
  denom as (select coalesce(sum(w), 0) as d from (select w from terms order by w desc limit 6) x),
  kw as (
    select i.id, sum(t.w) as s, array_agg(t.keyword order by t.w desc) as hits
    from terms t
    join public.investors i on i.keywords @> array[t.keyword] and i.active
    group by i.id
  ),
  mine as (
    select o.investor_id,
      bool_or(o.direction = 'outbound') as contacted,
      bool_or(o.direction = 'inbound') as replied,
      bool_or(o.opened_at is not null) as opened
    from public.outreach_messages o
    where o.owner_id = (select auth.uid()) and o.investor_id is not null
    group by o.investor_id
  ),
  queued as (
    select distinct e.investor_id from public.scheduled_emails e
    where e.owner_id = (select auth.uid()) and e.status in ('queued', 'sending')
  ),
  saved as (select v.investor_id from public.saved_investors v where v.owner_id = (select auth.uid())),
  picks as (select m.investor_id, m.rank, m.fit, m.why from public.investor_matches m where m.owner_id = (select auth.uid())),
  base as (
    select
      i.id, i.full_name, i.investor_type, i.stages, i.sectors, i."values" as vals, i.keywords, i.region, i.country, i.city, i.role,
      i.firm_employees, i.firm_funding, i.firm_founded, i.mobile, i.direct_phone, i.linkedin_url, i.twitter_url, i.firm_phone,
      i.website_url, i.phone, i.email, i.firm, i.firm_domain, i.search,
      cardinality(s.sectors) > 0 and i.sectors && s.sectors as sector_hit,
      s.stage is not null and s.stage = any (i.stages) as stage_hit,
      s.country is not null and i.country = s.country as country_hit,
      s.region is not null and i.region = s.region as region_hit,
      cardinality(s.vals) > 0 and i."values" && s.vals as value_hit,
      least(25, round(25 * kw.s / nullif((select d from denom), 0)))::int as kw_points,
      kw.hits,
      s.sectors as s_sectors, s.vals as s_vals, s.stage as s_stage, s.investor_types as s_types,
      coalesce(mine.contacted, false) as contacted,
      coalesce(mine.replied, false) as replied,
      coalesce(mine.opened, false) as opened,
      queued.investor_id is not null as queued,
      saved.investor_id is not null as saved,
      picks.rank as pick_rank, picks.fit as pick_fit, picks.why as pick_why
    from public.investors i
    cross join s
    left join kw on kw.id = i.id
    left join mine on mine.investor_id = i.id
    left join queued on queued.investor_id = i.id
    left join saved on saved.investor_id = i.id
    left join picks on picks.investor_id = i.id
    where i.active
  ),
  scored as (
    select b.*,
      greatest(0, least(100,
        case when b.sector_hit then 25 else 0 end
        + coalesce(b.kw_points, 0)
        + case when b.stage_hit then 15 when cardinality(b.stages) = 0 then 5 else 0 end
        + case when cardinality(b.s_types) = 0 then 5 when b.investor_type = any (b.s_types) then 10 else 0 end
        + case when b.country_hit then 10 when b.region_hit then 5 else 0 end
        + case when b.value_hit then 5 else 0 end
        + case b.role when 'partner' then 10 when 'angel' then 10 when 'principal' then 8 when 'venture_partner' then 5
                      when 'associate' then 4 when 'operating' then 0 when 'other' then 0 else -20 end
        - case when b.investor_type = 'pe' and b.s_stage in ('pre_seed', 'seed', 'angel', 'series_a') then 20 else 0 end
      ))::int as score,
      array_remove(array[
        case when b.sector_hit then 'sector:' || array_to_string(array(select x from unnest(b.sectors) x where x = any (b.s_sectors)), ',') end,
        case when b.stage_hit then 'stage:' || b.s_stage end,
        case when b.hits is not null then 'keywords:' || array_to_string(b.hits[1:3], ',') end,
        case when b.country_hit then 'country:' || b.country when b.region_hit then 'region:' || b.region end,
        case when b.value_hit then 'values:' || array_to_string(array(select x from unnest(b.vals) x where x = any (b.s_vals)), ',') end,
        case when b.role in ('partner', 'angel', 'principal') then 'role:' || b.role end
      ], null) as reasons,
      case b.role when 'partner' then 0 when 'angel' then 1 when 'principal' then 2 when 'venture_partner' then 3 when 'associate' then 4
                  when 'operating' then 5 when 'other' then 6 when 'investor_relations' then 7 else 8 end as role_rank
    from base b
  ),
  flagged as (
    select sc.*,
      (
        -- CASE, not OR: keywords and the search vector are large, so they are only read when a filter needs them.
        case when f.q is null then true
             else sc.search @@ f.tsq or sc.full_name ilike f.qlike or sc.firm ilike f.qlike or sc.email ilike f.qlike
                  or coalesce(sc.firm_domain, '') ilike f.qlike end
        and case when cardinality(f.kws) = 0 then true when f.kw_mode = 'all' then sc.keywords @> f.kws else sc.keywords && f.kws end
        and case when cardinality(f.kw_not) = 0 then true else not (sc.keywords && f.kw_not) end
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
        ('mobile' <> all (f.has) or sc.mobile is not null)
        and ('direct' <> all (f.has) or sc.direct_phone is not null)
        and ('any_phone' <> all (f.has) or sc.phone is not null)
        and ('linkedin' <> all (f.has) or sc.linkedin_url is not null)
        and ('twitter' <> all (f.has) or sc.twitter_url is not null)
        and ('firm_phone' <> all (f.has) or sc.firm_phone is not null)
        and ('website' <> all (f.has) or sc.website_url is not null)
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
  )
  select
    x.id, x.score, x.reasons, x.role_rank,
    x.saved, x.contacted, x.replied, x.opened, x.queued,
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

revoke all on function private.investor_directory(jsonb) from public, anon, authenticated;

-- One page of the directory for the signed-in founder, with the total after filters.
create or replace function public.search_investors(
  p_filters jsonb default '{}',
  p_sort text default 'match',
  p_dir text default 'desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with d as (
    select d.* from private.investor_directory(coalesce(p_filters, '{}')) d where d.m_all
  ),
  j as (
    select
      i.id, i.full_name, i.first_name, i.last_name, i.title, i.role, i.firm, i.firm_domain, i.email, i.phone, i.mobile, i.direct_phone,
      i.do_not_call, i.city, i.state, i.country, i.region, i.location, i.investor_type, i.stages, i.sectors, i."values",
      i.firm_employees, i.firm_funding, i.firm_founded, i.linkedin_url, i.twitter_url, i.website_url, i.source,
      d.score, d.reasons, d.role_rank, d.saved, d.contacted, d.replied, d.opened, d.queued, d.pick_rank, d.pick_fit, d.pick_why,
      row_number() over (partition by coalesce(i.firm_domain, lower(i.firm)) order by d.score desc, d.role_rank, i.full_name) as firm_rank
    from d join public.investors i on i.id = d.id
  ),
  k as (
    select * from j where not coalesce((p_filters ->> 'one_per_firm')::boolean, false) or firm_rank = 1
  ),
  ranked as (
    select k.*, row_number() over (order by
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
  )
  select jsonb_build_object(
    'total', (select count(*) from k),
    'rows', coalesce(
      (
        select jsonb_agg(to_jsonb(r) - 'rn' - 'firm_rank' - 'role_rank' order by r.rn)
        from ranked r
        where r.rn > greatest(p_offset, 0) and r.rn <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 1000)
      ),
      '[]'::jsonb
    )
  );
$$;

-- Option counts for every filter, each computed with all the other filters applied.
create or replace function public.investor_facets(p_filters jsonb default '{}')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with d as materialized (
    select d.*, i.investor_type, i.stages, i.sectors, i."values" as vals, i.region, i.country, i.city, i.role,
      i.firm_employees, i.firm_funding, i.mobile, i.direct_phone, i.phone, i.linkedin_url, i.twitter_url, i.firm_phone, i.website_url
    from private.investor_directory(coalesce(p_filters, '{}')) d
    join public.investors i on i.id = d.id
  )
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
        'mobile', count(*) filter (where mobile is not null),
        'direct', count(*) filter (where direct_phone is not null),
        'any_phone', count(*) filter (where phone is not null),
        'linkedin', count(*) filter (where linkedin_url is not null),
        'twitter', count(*) filter (where twitter_url is not null),
        'firm_phone', count(*) filter (where firm_phone is not null),
        'website', count(*) filter (where website_url is not null)
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
  );
$$;

revoke all on function public.search_investors(jsonb, text, text, integer, integer) from public, anon;
revoke all on function public.investor_facets(jsonb) from public, anon;
grant execute on function public.search_investors(jsonb, text, text, integer, integer) to authenticated;
grant execute on function public.investor_facets(jsonb) to authenticated;
