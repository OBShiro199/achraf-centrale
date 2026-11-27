-- Investor search with no filters (after "Clear all") timed out on free text and on name or firm order.
-- 1. Free text matches s.qtext with LIKE and specialties with ILIKE. Their trigram indexes (20261009101000) are missing
--    in production, so both scanned every row. Recreated here.
-- 2. Orders other than best fit now take the page from lead_search first and score only those rows,
--    when there is no minimum score and no one-per-firm (both need every row's score).
-- 3. Descending name and firm orders get matching indexes (nulls last, then id ascending).
create index if not exists lead_search_qtext_trgm on private.lead_search using gin (qtext extensions.gin_trgm_ops);
create index if not exists lead_text_specialties_trgm on private.lead_text using gin (specialties extensions.gin_trgm_ops);
create index if not exists lead_search_name_sort_desc on private.lead_search (full_name desc nulls last, id);
create index if not exists lead_search_firm_sort_desc on private.lead_search (firm desc nulls last, id);

CREATE OR REPLACE FUNCTION private.lead_page(f private.lead_query, p_sort text, p_dir text, p_limit integer, p_offset integer)
 RETURNS TABLE(id bigint, score integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET jit TO 'off'
 SET work_mem TO '64MB'
AS $function$
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
  top bigint[];
  last_score integer;
  n integer;
  page bigint[];
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

  -- Best fit first: filter the founder's top n investors. Exact when the page fills, when the top n is every investor,
  -- or when the n-th score is already below the minimum score asked for.
  if coalesce(p_sort, 'match') = 'match' and dir = 'desc' then
    n := (off + lim) * 4 + 200;
    while n <= 25000 loop
      select coalesce(array_agg(t.id order by t.score desc, t.id), '{}'), min(t.score) into top, last_score
      from private.lead_rank_top(f, n) t;
      execute format(body, '(' || w || ') and s.id = any ($4)') into ids, scores using f, lim, off, top;
      if cardinality(ids) = lim or cardinality(top) < n or (f.min_score is not null and last_score < f.min_score) then
        return query select u.id, u.score from unnest(ids, scores) as u(id, score);
        return;
      end if;
      n := n * 16;
    end loop;
  end if;

  -- Any other order without a minimum score or one per firm: take the page from lead_search by that order (index-backed for
  -- name and firm), then score only those rows. Scoring every investor first took 8 s or more with no filters.
  if coalesce(p_sort, 'match') not in ('match', 'picks') and f.min_score is null and not coalesce(f.one_per_firm, false) then
    execute format('select coalesce(array_agg(z.id), ''{}'') from (select s.id from private.lead_search s where %s order by %s limit $2 offset $3) z',
      w, replace(ord, 'm.', 's.')) into page using f, lim, off;
    execute format(body, '(' || w || ') and s.id = any ($4)') into ids, scores using f, lim, 0, page;
    return query select u.id, u.score from unnest(ids, scores) as u(id, score);
    return;
  end if;

  execute format(body, w) into ids, scores using f, lim, off, null::bigint[];
  return query select u.id, u.score from unnest(ids, scores) as u(id, score);
end;
$function$;
