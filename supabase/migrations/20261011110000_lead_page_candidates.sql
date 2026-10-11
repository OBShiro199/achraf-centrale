-- Faster best-fit pages. Without a sector or specialty match an investor scores at most 50
-- (stage 15 + type 10 + location 10 + role 10 + email 5), so when the page's lowest score from the
-- candidates that do match is above 50, those candidates hold the exact top results and the full
-- 335k-row scoring pass is skipped. Otherwise it falls back to scoring everyone.
create or replace function private.lead_page(f private.lead_query, p_sort text, p_dir text, p_limit integer, p_offset integer)
returns table (id bigint, score integer)
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

  body := 'with m as (
       select s.id, ' || sc || ' as score, s.firm_key, s.full_name, s.firm, s.country, s.city, s.size_rank, s.founded
       from private.lead_search s
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
    execute format(body, '(' || w || ') and (s.focus && ($1).f_focus or s.kw operator(extensions.&&) ($1).f_kw)')
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
revoke all on function private.lead_page(private.lead_query, text, text, integer, integer) from public, anon, authenticated;
