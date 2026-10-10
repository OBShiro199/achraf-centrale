-- Search engine for the investor directory. A search is one flat JSON object of filters (the same object the
-- filter bar builds, the AI returns and saved searches store). It is parsed into a typed record, turned into a
-- WHERE clause made only of fixed fragments that reference $1.field, and run with execute ... using, so no
-- user text ever enters SQL and Postgres plans each combination with the right index.
-- Filters stack with AND; values inside one filter are OR. Location filters (regions, countries, states,
-- cities) together count as one OR group.

drop type if exists private.lead_query cascade;
create type private.lead_query as (
  q_words text[],
  names text[],
  titles text[],
  titles_not text[],
  roles text[],
  firms text[],
  firms_not text[],
  industries text[],
  industries_not text[],
  sizes text[],
  founded_min integer,
  founded_max integer,
  about text[],
  specialties text[],
  stages text[],
  stages_not text[],
  focus text[],
  focus_not text[],
  countries text[],
  countries_not text[],
  regions text[],
  states text[],
  cities text[],
  has_email boolean,
  has_phone boolean,
  has_linkedin boolean,
  status text[],
  saved boolean,
  picks boolean,
  min_score integer,
  one_per_firm boolean,
  ids bigint[],
  -- The founder, for the fit score
  f_focus text[],
  f_stages text[],
  f_types text[],
  f_country text,
  f_region text,
  f_kw integer[],
  f_early boolean,
  -- The founder's own activity, as directory ids
  saved_ids bigint[],
  queued_ids bigint[],
  contacted_ids bigint[],
  opened_ids bigint[],
  replied_ids bigint[],
  pick_ids bigint[]
);

-- ------------------------------------------------------------------------------------------
-- JSON helpers: coerce one key, drop anything malformed, null means "no filter".

create or replace function private.jtext(j jsonb, k text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select nullif(array(
    select left(trim(v), 120)
    from jsonb_array_elements_text(case when jsonb_typeof(j -> k) = 'array' then j -> k else '[]'::jsonb end) with ordinality as e(v, n)
    where trim(v) <> '' and n <= 50
  ), '{}');
$$;

-- '%value%' patterns with %, _ and \ escaped, for ilike.
create or replace function private.jlike(j jsonb, k text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select nullif(array(
    select '%' || replace(replace(replace(v, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    from unnest(coalesce(private.jtext(j, k), '{}')) v
  ), '{}');
$$;

create or replace function private.jbool(j jsonb, k text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(j -> k) = 'boolean' then (j ->> k)::boolean end;
$$;

create or replace function private.jint(j jsonb, k text, lo integer, hi integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(j -> k) = 'number' then least(greatest(round((j ->> k)::numeric)::integer, lo), hi) end;
$$;

-- "(col ilike ($1).field[1] or col ilike ($1).field[2] ...)": trigram indexes serve this form, not ilike any().
create or replace function private.ilike_or(p_col text, p_field text, p_n integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select '(' || string_agg(format('%s ilike ($1).%s[%s]', p_col, p_field, i), ' or ') || ')'
  from generate_series(1, greatest(p_n, 1)) i;
$$;

-- ------------------------------------------------------------------------------------------
-- The founder's thesis, mapped onto the directory's stage and focus values.

create or replace function private.focus_for_sectors(p text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(select distinct f from unnest(p) s, unnest(case s
    when 'b2b_saas' then array['SaaS/Enterprise']
    when 'ai_ml' then array['AI/ML']
    when 'fintech' then array['FinTech']
    when 'climate' then array['Climate/Energy']
    when 'health' then array['HealthTech', 'BioTech']
    when 'consumer' then array['Consumer']
    when 'ecommerce' then array['E-commerce', 'Consumer']
    when 'hardware' then array['Hardware/Semis', 'Robotics', 'DeepTech']
    when 'marketplace' then array['Marketplace']
    when 'devtools' then array['DevTools/Data']
    when 'gtm_sales' then array['SaaS/Enterprise', 'Future of Work']
    when 'edtech' then array['EdTech']
    when 'proptech' then array['PropTech/RealEstate']
    when 'food_agri' then array['AgTech/Food']
    when 'logistics' then array['Logistics/SupplyChain', 'Mobility']
    else array[]::text[] end) f), '{}');
$$;

create or replace function private.stages_for_round(p text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'pre_seed' then array['Pre-Seed', 'Seed', 'Angel', 'Accelerator', 'Early Stage']
    when 'angel' then array['Angel', 'Pre-Seed', 'Seed', 'Early Stage']
    when 'seed' then array['Seed', 'Pre-Seed', 'Early Stage']
    when 'series_a' then array['Series A', 'Early Stage', 'Growth']
    when 'series_b' then array['Series B', 'Series C', 'Series D+', 'Growth', 'Late Stage']
    else array[]::text[]
  end;
$$;

create or replace function private.stages_for_types(p text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(select distinct x from unnest(p) t, unnest(case t
    when 'vc' then array['Pre-Seed', 'Seed', 'Early Stage', 'Series A', 'Series B', 'Series C', 'Series D+', 'Growth']
    when 'angel' then array['Angel']
    when 'accelerator' then array['Accelerator']
    when 'pe' then array['Buyout/PE']
    else array[]::text[] end) x), '{}');
$$;

-- ------------------------------------------------------------------------------------------
-- JSON filters plus the founder's context -> typed record.

create or replace function private.lead_query_from(j jsonb, p_uid uuid)
returns private.lead_query
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f private.lead_query;
  st record;
  q text := left(trim(coalesce(j ->> 'q', '')), 120);
begin
  j := case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end;

  if q <> '' then
    f.q_words := nullif(array(
      select '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      from unnest(regexp_split_to_array(lower(q), '\s+')) with ordinality as x(w, n)
      where w <> '' and n <= 8
    ), '{}');
  end if;
  f.names := private.jlike(j, 'names');
  f.titles := private.jlike(j, 'titles');
  f.titles_not := private.jlike(j, 'titlesNot');
  f.roles := private.jtext(j, 'roles');
  f.firms := private.jlike(j, 'firms');
  f.firms_not := private.jlike(j, 'firmsNot');
  f.industries := private.jtext(j, 'industries');
  f.industries_not := private.jtext(j, 'industriesNot');
  f.sizes := private.jtext(j, 'sizes');
  f.founded_min := private.jint(j, 'foundedMin', 1800, 2100);
  f.founded_max := private.jint(j, 'foundedMax', 1800, 2100);
  f.about := private.jlike(j, 'about');
  f.specialties := private.jlike(j, 'specialties');
  f.stages := private.jtext(j, 'stages');
  f.stages_not := private.jtext(j, 'stagesNot');
  f.focus := private.jtext(j, 'focus');
  f.focus_not := private.jtext(j, 'focusNot');
  f.countries := private.jtext(j, 'countries');
  f.countries_not := private.jtext(j, 'countriesNot');
  f.regions := private.jtext(j, 'regions');
  f.states := private.jtext(j, 'states');
  f.cities := private.jlike(j, 'cities');
  f.has_email := private.jbool(j, 'hasEmail');
  f.has_phone := private.jbool(j, 'hasPhone');
  f.has_linkedin := private.jbool(j, 'hasLinkedin');
  f.status := nullif(array(select s from unnest(coalesce(private.jtext(j, 'status'), '{}')) s
    where s in ('new', 'queued', 'contacted', 'opened', 'replied', 'no_reply')), '{}');
  f.saved := private.jbool(j, 'saved');
  f.picks := private.jbool(j, 'picks');
  f.min_score := nullif(private.jint(j, 'minScore', 0, 100), 0);
  f.one_per_firm := coalesce(private.jbool(j, 'onePerFirm'), false);
  if jsonb_typeof(j -> 'ids') = 'array' then
    f.ids := nullif(array(select v::bigint from jsonb_array_elements_text(j -> 'ids') with ordinality e(v, n) where v ~ '^[0-9]{1,12}$' and n <= 1000), '{}');
  end if;

  select s.sectors, s.stage, s.investor_types, s.country, s.match_keywords, s.keywords into st
  from public.startups s where s.owner_id = p_uid;
  f.f_focus := private.focus_for_sectors(coalesce(st.sectors, '{}'));
  f.f_stages := private.stages_for_round(st.stage);
  f.f_types := private.stages_for_types(coalesce(st.investor_types, '{}'));
  f.f_country := st.country;
  f.f_region := private.region_of(st.country);
  f.f_early := coalesce(st.stage, 'seed') in ('pre_seed', 'angel', 'seed', 'series_a');
  f.f_kw := coalesce(array(
    select distinct k.id from private.lead_keywords k
    where k.keyword = any (array(select lower(trim(x)) from unnest(coalesce(st.match_keywords, '{}') || coalesce(st.keywords, '{}')) x))
  ), '{}');

  if p_uid is not null then
    f.saved_ids := coalesce(array(select investor_id from public.saved_investors where owner_id = p_uid and investor_id is not null), '{}');
    f.queued_ids := coalesce(array(select distinct investor_id from public.scheduled_emails where owner_id = p_uid and status in ('queued', 'sending') and investor_id is not null), '{}');
    f.contacted_ids := coalesce(array(select distinct investor_id from public.outreach_messages where owner_id = p_uid and direction = 'outbound' and investor_id is not null), '{}');
    f.opened_ids := coalesce(array(select distinct investor_id from public.outreach_messages where owner_id = p_uid and direction = 'outbound' and opened_at is not null and investor_id is not null), '{}');
    f.replied_ids := coalesce(array(select distinct investor_id from public.outreach_messages where owner_id = p_uid and direction = 'inbound' and investor_id is not null), '{}');
    f.pick_ids := coalesce(array(select investor_id from public.investor_matches where owner_id = p_uid and investor_id is not null order by rank), '{}');
  end if;
  return f;
end;
$$;

-- ------------------------------------------------------------------------------------------
-- Record -> WHERE clause from fixed fragments.

create or replace function private.lead_where(f private.lead_query)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  c text[] := '{}';
  t text[] := '{}';
  loc text[] := '{}';
  st text[] := '{}';
begin
  if f.q_words is not null then
    for i in 1 .. cardinality(f.q_words) loop
      c := array_append(c, format('s.qtext like ($1).q_words[%s]', i));
    end loop;
  end if;
  if f.ids is not null then c := array_append(c, 's.id = any (($1).ids)'); end if;
  if f.names is not null then c := array_append(c, private.ilike_or('s.full_name', 'names', cardinality(f.names))); end if;
  if f.titles is not null then c := array_append(c, private.ilike_or('s.title', 'titles', cardinality(f.titles))); end if;
  if f.titles_not is not null then c := array_append(c, 'not (coalesce(s.title, '''') ilike any (($1).titles_not))'); end if;
  if f.roles is not null then c := array_append(c, 's.role = any (($1).roles)'); end if;
  if f.firms is not null then c := array_append(c, private.ilike_or('s.firm', 'firms', cardinality(f.firms))); end if;
  if f.firms_not is not null then c := array_append(c, 'not (coalesce(s.firm, '''') ilike any (($1).firms_not))'); end if;
  if f.industries is not null then c := array_append(c, 's.industry = any (($1).industries)'); end if;
  if f.industries_not is not null then c := array_append(c, 'not (coalesce(s.industry, '''') = any (($1).industries_not))'); end if;
  if f.sizes is not null then c := array_append(c, 's.size = any (($1).sizes)'); end if;
  if f.founded_min is not null then c := array_append(c, 's.founded >= ($1).founded_min'); end if;
  if f.founded_max is not null then c := array_append(c, 's.founded <= ($1).founded_max'); end if;
  if f.stages is not null then c := array_append(c, 's.stages && ($1).stages'); end if;
  if f.stages_not is not null then c := array_append(c, 'not (s.stages && ($1).stages_not)'); end if;
  if f.focus is not null then c := array_append(c, 's.focus && ($1).focus'); end if;
  if f.focus_not is not null then c := array_append(c, 'not (s.focus && ($1).focus_not)'); end if;
  if f.countries_not is not null then c := array_append(c, 'not (coalesce(s.country, '''') = any (($1).countries_not))'); end if;
  if f.has_email is not null then c := array_append(c, 's.has_email = ($1).has_email'); end if;
  if f.has_phone is not null then c := array_append(c, 's.has_phone = ($1).has_phone'); end if;
  if f.has_linkedin is not null then c := array_append(c, 's.has_linkedin = ($1).has_linkedin'); end if;
  if f.saved is not null then
    c := array_append(c, case when f.saved then 's.id = any (($1).saved_ids)' else 'not (s.id = any (($1).saved_ids))' end);
  end if;
  if f.picks is not null then
    c := array_append(c, case when f.picks then 's.id = any (($1).pick_ids)' else 'not (s.id = any (($1).pick_ids))' end);
  end if;

  -- Location: one OR group.
  if f.regions is not null then loc := array_append(loc, 's.region = any (($1).regions)'); end if;
  if f.countries is not null then loc := array_append(loc, 's.country = any (($1).countries)'); end if;
  if f.states is not null then loc := array_append(loc, 's.state = any (($1).states)'); end if;
  if f.cities is not null then loc := array_append(loc, private.ilike_or('s.city', 'cities', cardinality(f.cities))); end if;
  if cardinality(loc) > 0 then c := array_append(c, '(' || array_to_string(loc, ' or ') || ')'); end if;

  -- Contact status: one OR group.
  if f.status is not null then
    if 'new' = any (f.status) then st := array_append(st, '(not (s.id = any (($1).contacted_ids)) and not (s.id = any (($1).queued_ids)))'); end if;
    if 'queued' = any (f.status) then st := array_append(st, 's.id = any (($1).queued_ids)'); end if;
    if 'contacted' = any (f.status) then st := array_append(st, 's.id = any (($1).contacted_ids)'); end if;
    if 'opened' = any (f.status) then st := array_append(st, 's.id = any (($1).opened_ids)'); end if;
    if 'replied' = any (f.status) then st := array_append(st, 's.id = any (($1).replied_ids)'); end if;
    if 'no_reply' = any (f.status) then st := array_append(st, '(s.id = any (($1).contacted_ids) and not (s.id = any (($1).replied_ids)))'); end if;
    c := array_append(c, '(' || array_to_string(st, ' or ') || ')');
  end if;

  -- Long text goes through one indexed sub-select on lead_text.
  if f.about is not null then t := array_append(t, private.ilike_or('t.about', 'about', cardinality(f.about))); end if;
  if f.specialties is not null then t := array_append(t, private.ilike_or('t.specialties', 'specialties', cardinality(f.specialties))); end if;
  if cardinality(t) > 0 then
    c := array_append(c, 's.id in (select t.id from private.lead_text t where ' || array_to_string(t, ' and ') || ')');
  end if;

  return case when cardinality(c) = 0 then 'true' else array_to_string(c, ' and ') end;
end;
$$;

-- The fit score (0 to 100) as a SQL expression over s.* and the founder fields of $1.
create or replace function private.lead_score_sql()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'greatest(0, least(100, '
    || '(case when s.focus && ($1).f_focus then 30 else 0 end)'
    || ' + least(20, extensions.icount(s.kw operator(extensions.&) ($1).f_kw) * 5)'
    || ' + (case when s.stages && ($1).f_stages then 15 when cardinality(s.stages) = 0 then 5 else 0 end)'
    || ' + (case when cardinality(($1).f_types) = 0 then 5 when s.stages && ($1).f_types then 10 else 0 end)'
    || ' + (case when ($1).f_country is not null and s.country = ($1).f_country then 10 when ($1).f_region is not null and s.region = ($1).f_region then 5 else 0 end)'
    || ' + (case s.role when ''partner'' then 10 when ''angel'' then 10 when ''principal'' then 8 when ''venture_partner'' then 5 when ''associate'' then 4 when ''operating'' then 2 when ''investor_relations'' then -20 when ''lp'' then -20 else 0 end)'
    || ' + (case when s.has_email then 5 else 0 end)'
    || ' - (case when ($1).f_early and cardinality(s.stages) > 0 and s.stages <@ array[''Buyout/PE'', ''Fund of Funds'', ''Late Stage'', ''Venture Debt''] then 20 else 0 end)'
    || '))';
$$;

-- ------------------------------------------------------------------------------------------
-- One page of matching ids with their fit score. Stable order: the sort key, then id.

create or replace function private.lead_page(f private.lead_query, p_sort text, p_dir text, p_limit integer, p_offset integer)
returns table (id bigint, score integer)
language plpgsql
stable
security definer
set search_path = ''
set jit = 'off'
set work_mem = '64MB'
set statement_timeout = '15s'
as $$
declare
  w text := private.lead_where(f);
  sc text := private.lead_score_sql();
  dir text := case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  ord text;
begin
  ord := case coalesce(p_sort, 'match')
    when 'name' then format('m.full_name %s nulls last, m.id', dir)
    when 'firm' then format('m.firm %s nulls last, m.id', dir)
    when 'location' then format('m.country %s nulls last, m.city %s nulls last, m.id', dir, dir)
    when 'size' then format('m.size_rank %s nulls last, m.id', dir)
    when 'founded' then format('m.founded %s nulls last, m.id', dir)
    when 'picks' then 'array_position(($1).pick_ids, m.id) nulls last, m.score desc, m.id'
    else format('m.score %s, m.id', dir)
  end;

  return query execute
    'with m as (
       select s.id, ' || sc || ' as score, s.firm_key, s.full_name, s.firm, s.country, s.city, s.size_rank, s.founded
       from private.lead_search s
       where ' || w || '
     ), g as (
       select * from m where ($1).min_score is null or m.score >= ($1).min_score
     ), k as (
       select * from g where not ($1).one_per_firm
       union all
       (select distinct on (g.firm_key) g.* from g where ($1).one_per_firm order by g.firm_key, g.score desc, g.id)
     )
     select m.id, m.score::integer from k m
     order by ' || ord || '
     limit $2 offset $3'
  using f, least(greatest(coalesce(p_limit, 50), 1), 1000), least(greatest(coalesce(p_offset, 0), 0), 10000);
end;
$$;

-- How many match, counting at most 10,001 (shown as 10,000+). Null if cancelled; API calls are also bounded by
-- the authenticated role's statement timeout, since a timeout set inside a function does not apply to its own statement.
create or replace function private.lead_count(f private.lead_query)
returns integer
language plpgsql
stable
security definer
set search_path = ''
set jit = 'off'
set work_mem = '64MB'
as $$
declare
  w text := private.lead_where(f);
  sc text := private.lead_score_sql();
  n integer;
begin
  -- offset 0 keeps the filter scan first, so distinct firms are hashed rather than walked in firm order.
  if f.one_per_firm then
    execute 'select count(*) from (select distinct k from (select s.firm_key k from private.lead_search s where ' || w
      || case when f.min_score is not null then ' and ' || sc || ' >= ($1).min_score' else '' end || ' offset 0) a limit 10001) x'
      into n using f;
  else
    execute 'select count(*) from (select 1 from private.lead_search s where ' || w
      || case when f.min_score is not null then ' and ' || sc || ' >= ($1).min_score' else '' end || ' limit 10001) x'
      into n using f;
  end if;
  return n;
exception when query_canceled then
  return null;
end;
$$;

revoke all on function private.lead_query_from(jsonb, uuid), private.lead_where(private.lead_query), private.lead_page(private.lead_query, text, text, integer, integer),
  private.lead_count(private.lead_query) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------
-- Keep the slim search table and its small indexes in memory: cold reads on this instance are 50x slower.

create extension if not exists pg_prewarm with schema extensions;
create or replace function private.prewarm_lead_search()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform extensions.pg_prewarm('private.lead_search'::regclass);
  perform extensions.pg_prewarm('private.lead_search_focus'::regclass);
  perform extensions.pg_prewarm('private.lead_search_stages'::regclass);
  perform extensions.pg_prewarm('private.lead_search_pkey'::regclass);
  perform extensions.pg_prewarm('private.lead_search_country'::regclass);
end;
$$;
select private.prewarm_lead_search();
select cron.schedule('prewarm-lead-search', '*/5 * * * *', $$select private.prewarm_lead_search()$$);

do $$
begin
  perform cron.unschedule('sync-investors');
exception when others then null;
end $$;
