-- Investor directory v2: public.investors_achraf (335k rows) is the only investor source. Searches run on a
-- slim, fully indexed copy (private.lead_search) and join back to the source for one page of ids.
-- Saves, outreach, matches and reveals reference investors_achraf.id; the old public.investors table is no
-- longer read.

-- ------------------------------------------------------------------------------------------
-- Derived values

-- What a contact does at their firm, from the job title.
create or replace function private.lead_role(p_title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when t is null or t = '' then 'other'
    when t ~ '(investor relations|\mir\M|capital formation|fundrais|capital raising)' then 'investor_relations'
    when t ~ '(limited partner|\mlp\M)' then 'lp'
    when t ~ '(operating partner|operations partner|platform|talent|portfolio (operations|support|success)|community|marketing|executive partner|value creation)' then 'operating'
    when t ~ '(venture partner|scout|entrepreneur in residence|\meir\M|advis)' then 'venture_partner'
    when t ~ '\mangel\M' then 'angel'
    when t ~ '(partner|managing director|founder|chief executive|\mceo\M|chief investment|\mcio\M|president|\mchair|managing member|\mgp\M)' then 'partner'
    when t ~ '(principal|director|vice president|\mvp\M|head of|investment manager)' then 'principal'
    when t ~ '(associate|analyst|intern|fellow)' then 'associate'
    when t ~ '(invest|\mvc\M|venture)' then 'associate'
    else 'other'
  end
  from (select lower(p_title) as t) x;
$$;

-- Firm sizes arrive in two band styles; normalise to LinkedIn's.
create or replace function private.size_band(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case trim(coalesce(p, ''))
    when '1-10' then '1-10' when '< 5' then '1-10'
    when '11-50' then '11-50' when '5 - 19' then '11-50'
    when '51-200' then '51-200' when '20 - 99' then '51-200' when '100 - 249' then '51-200'
    when '201-500' then '201-500' when '250 - 499' then '201-500'
    when '501-1000' then '501-1000'
    when '1001-5000' then '1001-5000'
    when '5001-10000' then '5001-10000'
    when '10001+' then '10001+'
    else null
  end;
$$;

create or replace function private.size_rank(p text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (array_position(array['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'], p))::smallint;
$$;

create or replace function private.jsonb_text_array(p jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end)), '{}');
$$;

-- What kind of investor, shown on profiles and used in drafting.
create or replace function private.lead_investor_type(p_stages text[], p_firm text, p_title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_firm ~* 'family office' then 'family_office'
    when 'Accelerator' = any (p_stages) or p_firm ~* '(accelerator|incubator|combinator)' then 'accelerator'
    when 'Angel' = any (p_stages) or p_title ~* '\mangel\M' then 'angel'
    when cardinality(p_stages) > 0 and p_stages <@ array['Buyout/PE', 'Fund of Funds', 'Late Stage', 'Venture Debt'] then 'pe'
    else 'vc'
  end;
$$;

-- ------------------------------------------------------------------------------------------
-- Slim search tables

-- Specialty keywords (from the semicolon list) that at least 3 investors share, with ids for intarray matching.
create table if not exists private.lead_keywords (
  id serial primary key,
  keyword text not null unique,
  df integer not null default 0
);

create table if not exists private.lead_search (
  id bigint primary key,
  full_name text,
  title text,
  firm text,
  firm_key text,
  firm_domain text,
  role text not null default 'other',
  stages text[] not null default '{}',
  focus text[] not null default '{}',
  industry text,
  size text,
  size_rank smallint,
  founded smallint,
  city text,
  state text,
  country text,
  region text,
  has_email boolean not null default false,
  has_phone boolean not null default false,
  has_linkedin boolean not null default false,
  kw integer[] not null default '{}',
  -- Name, title, firm, domain, city and country in lower case, for the quick search box.
  qtext text
);

-- Long text filters, kept apart so lead_search stays narrow.
create table if not exists private.lead_text (
  id bigint primary key,
  headline text,
  about text,
  specialties text
);

-- Allowed values per enum filter, with counts. Read through public.lead_facets().
create table if not exists private.lead_facets (
  facet text not null,
  value text not null,
  n integer not null,
  primary key (facet, value)
);

alter table private.lead_keywords enable row level security;
alter table private.lead_search enable row level security;
alter table private.lead_text enable row level security;
alter table private.lead_facets enable row level security;
revoke all on private.lead_keywords, private.lead_search, private.lead_text, private.lead_facets from anon, authenticated;

-- ------------------------------------------------------------------------------------------
-- Refresh (run after every import into investors_achraf)

create or replace function private.refresh_lead_keywords()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  truncate private.lead_keywords restart identity;
  insert into private.lead_keywords (keyword, df)
  select k, count(*) from (
    select distinct a.id, lower(trim(k)) as k
    from public.investors_achraf a, unnest(string_to_array(a.specialties, ';')) as k
    where a.specialties is not null
  ) x
  where length(k) between 2 and 60
  group by k
  having count(*) >= 3;
  get diagnostics n = row_count;
  analyze private.lead_keywords;
  return n;
end;
$$;

-- Rebuilds the search rows for one id range; call in ranges so each run stays short.
create or replace function private.refresh_lead_search_range(p_lo bigint, p_hi bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from private.lead_search where id between p_lo and p_hi;
  delete from private.lead_text where id between p_lo and p_hi;

  insert into private.lead_search (
    id, full_name, title, firm, firm_key, firm_domain, role, stages, focus, industry, size, size_rank, founded,
    city, state, country, region, has_email, has_phone, has_linkedin, kw, qtext
  )
  select
    a.id,
    nullif(trim(a.full_name), ''),
    nullif(trim(a.title), ''),
    nullif(trim(a.firm), ''),
    coalesce(nullif(lower(trim(a.firm_domain)), ''), lower(trim(a.firm)), a.id::text),
    nullif(lower(trim(a.firm_domain)), ''),
    private.lead_role(a.title),
    private.jsonb_text_array(a.stage),
    private.jsonb_text_array(a.focus),
    nullif(trim(a.firm_industry), ''),
    private.size_band(a.firm_size),
    private.size_rank(private.size_band(a.firm_size)),
    a.firm_founded,
    nullif(trim(a.city), ''),
    nullif(trim(a.state), ''),
    nullif(trim(a.country), ''),
    private.region_of(nullif(trim(a.country), '')),
    coalesce(a.email, '') <> '',
    coalesce(a.phone, '') <> '',
    coalesce(a.linkedin_url, '') <> '',
    coalesce((
      select array_agg(distinct k.id order by k.id)
      from unnest(string_to_array(a.specialties, ';')) as s
      join private.lead_keywords k on k.keyword = lower(trim(s))
    ), '{}'),
    lower(concat_ws(' ', a.full_name, a.title, a.firm, a.firm_domain, a.city, a.country))
  from public.investors_achraf a
  where a.id between p_lo and p_hi;
  get diagnostics n = row_count;

  insert into private.lead_text (id, headline, about, specialties)
  select a.id, nullif(trim(a.headline), ''), nullif(trim(a.firm_about), ''), nullif(trim(a.specialties), '')
  from public.investors_achraf a
  where a.id between p_lo and p_hi
    and (a.headline is not null or a.firm_about is not null or a.specialties is not null);

  return n;
end;
$$;

create or replace function private.refresh_lead_facets()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  truncate private.lead_facets;
  insert into private.lead_facets (facet, value, n)
  select 'stage', v, count(*) from private.lead_search, unnest(stages) v group by v
  union all select 'focus', v, count(*) from private.lead_search, unnest(focus) v group by v
  union all select 'role', role, count(*) from private.lead_search group by role
  union all select 'size', size, count(*) from private.lead_search where size is not null group by size
  union all select 'region', region, count(*) from private.lead_search where region is not null group by region
  union all select 'country', country, count(*) from private.lead_search where country is not null group by country
  union all (select 'industry', industry, count(*) from private.lead_search where industry is not null group by industry order by count(*) desc limit 400)
  union all (select 'state', state, count(*) from private.lead_search where state is not null group by state order by count(*) desc limit 300)
  union all (select 'city', city, count(*) from private.lead_search where city is not null group by city order by count(*) desc limit 500)
  union all (select 'specialty', keyword, df from private.lead_keywords order by df desc limit 1500);
  get diagnostics n = row_count;
  analyze private.lead_search;
  analyze private.lead_text;
  return n;
end;
$$;

revoke all on function private.refresh_lead_keywords(), private.refresh_lead_search_range(bigint, bigint), private.refresh_lead_facets() from public, anon, authenticated;

