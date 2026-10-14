-- Onboarding matches: every founder leaves onboarding with 10 investors at their round.
-- The old match-investors flow ran the full directory search (about 8 seconds against an 8 second limit) and
-- two Claude calls, and failed for every founder. This is one query:
--   1. investors tagged with the founder's exact round (Pre-Seed, Seed, Series A and so on) who can be emailed,
--      are not LPs or investor relations staff, one person per firm;
--   2. ranked by the fit score, so the founder's sectors, keywords and country come first;
--   3. the top 10 are saved as the founder's matches, each with a reason taken from the data.
-- If fewer than 10 match the exact round it widens to neighbouring rounds, then to anyone.

create or replace function public.match_onboarding(p_uid uuid, p_count integer default 10)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.startups;
  exact text[];
  round_label text;
  f private.lead_query;
  tier integer;
  ids bigint[];
  scores integer[];
  n integer;
begin
  select * into st from public.startups where owner_id = p_uid;
  if st.id is null then raise exception 'not_found: Finish onboarding first.' using errcode = 'P0001'; end if;

  exact := case st.stage
    when 'pre_seed' then array['Pre-Seed']
    when 'angel' then array['Angel']
    when 'seed' then array['Seed']
    when 'series_a' then array['Series A']
    when 'series_b' then array['Series B']
    else array[]::text[]
  end;
  round_label := exact[1];
  f := private.lead_query_from('{}'::jsonb, p_uid);

  for tier in 1 .. 3 loop
    execute format($q$
      with %s,
      pool as (
        select s.id, s.firm_key, %s as score
        from private.lead_search s, p
        where s.has_email
          and s.role not in ('lp', 'investor_relations', 'operating')
          and case $3
            when 1 then s.stages && $4
            when 2 then s.stages && p.f_stages
            else true
          end
      ),
      best as (
        select distinct on (pool.firm_key) pool.id, pool.score from pool order by pool.firm_key, pool.score desc, pool.id
      ),
      top as (select best.id, best.score from best order by best.score desc, best.id limit $2)
      select coalesce(array_agg(top.id order by top.score desc, top.id), '{}'),
             coalesce(array_agg(top.score::integer order by top.score desc, top.id), '{}')
      from top
    $q$, private.lead_founder_cte(), private.lead_score_sql())
    into ids, scores
    using f, p_count, tier, exact;
    exit when cardinality(ids) >= p_count;
  end loop;

  delete from public.investor_matches where owner_id = p_uid;
  insert into public.investor_matches (owner_id, investor_id, rank, fit, why)
  select p_uid, u.id, u.ord::integer,
    case when u.score >= 70 then 5 when u.score >= 55 then 4 when u.score >= 40 then 3 else 2 end,
    concat_ws(' ',
      coalesce(s.firm, s.full_name),
      case
        when round_label is not null and round_label = any (s.stages) then 'invests at ' || round_label
        when s.stages && f.f_stages then 'invests at ' || (select x from unnest(s.stages) x where x = any (f.f_stages) limit 1)
        else 'invests in early stage companies'
      end
      || coalesce(' and focuses on ' || (select string_agg(x, ' and ') from (select x from unnest(s.focus) x where x = any (f.f_focus) limit 2) y), '')
      || coalesce(', based in ' || nullif(s.country, ''), '')
      || '.'
    )
  from unnest(ids, scores) with ordinality as u(id, score, ord)
  join private.lead_search s on s.id = u.id;
  get diagnostics n = row_count;

  update public.startups set matches_status = 'done', matched_at = now() where owner_id = p_uid;
  return n;
end;
$$;

revoke all on function public.match_onboarding(uuid, integer) from public, anon, authenticated;
grant execute on function public.match_onboarding(uuid, integer) to service_role;
