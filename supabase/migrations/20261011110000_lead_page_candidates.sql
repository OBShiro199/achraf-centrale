-- Search speed-ups after the free-plan instance was CPU-throttled (about 10x slower than at build time).
-- 1. The fit score reads the founder's fields from a one-row CTE (p) instead of selecting fields from the
--    composite parameter on every row.
-- 2. Best-fit pages first score only investors sharing a sector or specialty with the founder. Without one an
--    investor scores at most 50 (stage 15 + type 10 + location 10 + role 10 + email 5), so when the page's lowest
--    candidate score is above 50 the result is exact and the full pass is skipped.
-- 3. The keep-warm job is paused while the instance is throttled.

create or replace function private.lead_score_sql()
returns text language sql immutable set search_path = '' as $$
  select 'greatest(0, least(100, '
    || '(case when s.focus && p.f_focus then 30 else 0 end)'
    || ' + (case when s.kw operator(extensions.&&) p.f_kw then least(20, extensions.icount(s.kw operator(extensions.&) p.f_kw) * 5) else 0 end)'
    || ' + (case when s.stages && p.f_stages then 15 when cardinality(s.stages) = 0 then 5 else 0 end)'
    || ' + (case when p.no_types then 5 when s.stages && p.f_types then 10 else 0 end)'
    || ' + (case when s.country = p.f_country then 10 when s.region = p.f_region then 5 else 0 end)'
    || ' + (case s.role when ''partner'' then 10 when ''angel'' then 10 when ''principal'' then 8 when ''venture_partner'' then 5 when ''associate'' then 4 when ''operating'' then 2 when ''investor_relations'' then -20 when ''lp'' then -20 else 0 end)'
    || ' + (case when s.has_email then 5 else 0 end)'
    || ' - (case when p.f_early and cardinality(s.stages) > 0 and s.stages <@ array[''Buyout/PE'', ''Fund of Funds'', ''Late Stage'', ''Venture Debt''] then 20 else 0 end)'
    || '))';
$$;

create or replace function private.lead_founder_cte()
returns text language sql immutable set search_path = '' as $$
  select 'p as materialized (select coalesce(($1).f_focus, ''{}'') f_focus, coalesce(($1).f_kw, ''{}'') f_kw, '
    || 'coalesce(($1).f_stages, ''{}'') f_stages, coalesce(($1).f_types, ''{}'') f_types, '
    || 'cardinality(coalesce(($1).f_types, ''{}'')) = 0 no_types, ($1).f_country f_country, ($1).f_region f_region, coalesce(($1).f_early, false) f_early)';
$$;

create or replace function private.lead_page(f private.lead_query, p_sort text, p_dir text, p_limit integer, p_offset integer)
returns table (id bigint, score integer)
language plpgsql stable security definer set search_path = '' set jit = 'off' set work_mem = '64MB'
as $$
declare
  w text := private.lead_where(f);
  sc text := private.lead_score_sql();
  dir text := case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 1000);
  off integer := least(greatest(coalesce(p_offset, 0), 0), 10000);
  ord text;
  body text;
  ids bigint[];
  scores integer[];
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

  body := 'with ' || private.lead_founder_cte() || ', m as (
       select s.id, ' || sc || ' as score, s.firm_key, s.full_name, s.firm, s.country, s.city, s.size_rank, s.founded
       from private.lead_search s cross join p
       where %s
     ), g as (
       select * from m where ($1).min_score is null or m.score >= ($1).min_score
     ), k as (
       select * from g where not ($1).one_per_firm
       union all
       (select distinct on (g.firm_key) g.* from g where ($1).one_per_firm order by g.firm_key, g.score desc, g.id)
     )
     select coalesce(array_agg(x.id order by x.n), ''{}''), coalesce(array_agg(x.score order by x.n), ''{}'')
     from (select m.id, m.score::integer as score, row_number() over (order by ' || ord || ') as n
           from k m order by ' || ord || ' limit $2 offset $3) x';

  if coalesce(p_sort, 'match') = 'match' and dir = 'desc'
     and (cardinality(coalesce(f.f_focus, '{}')) > 0 or cardinality(coalesce(f.f_kw, '{}')) > 0) then
    execute format(body, '(' || w || ') and (s.focus && p.f_focus or s.kw operator(extensions.&&) p.f_kw)')
      into ids, scores using f, lim, off;
    if cardinality(ids) = lim and scores[lim] > 50 then
      return query select u.id, u.score from unnest(ids, scores) as u(id, score);
      return;
    end if;
  end if;

  execute format(body, w) into ids, scores using f, lim, off;
  return query select u.id, u.score from unnest(ids, scores) as u(id, score);
end;
$$;

create or replace function private.lead_count(f private.lead_query)
returns integer language plpgsql stable security definer set search_path = '' set jit = 'off' set work_mem = '64MB'
as $$
declare
  w text := private.lead_where(f);
  sc text := private.lead_score_sql();
  pre text := 'with ' || private.lead_founder_cte() || ' ';
  n integer;
begin
  if f.one_per_firm then
    execute pre || 'select count(*) from (select distinct k from (select s.firm_key k from private.lead_search s cross join p where ' || w
      || case when f.min_score is not null then ' and ' || sc || ' >= ($1).min_score' else '' end || ' offset 0) a limit 10001) x'
      into n using f;
  else
    execute pre || 'select count(*) from (select 1 from private.lead_search s cross join p where ' || w
      || case when f.min_score is not null then ' and ' || sc || ' >= ($1).min_score' else '' end || ' limit 10001) x'
      into n using f;
  end if;
  return n;
exception when query_canceled then
  return null;
end;
$$;
revoke all on function private.lead_page(private.lead_query, text, text, integer, integer), private.lead_count(private.lead_query) from public, anon, authenticated;

do $$ begin perform cron.unschedule('prewarm-lead-search'); exception when others then null; end $$;
