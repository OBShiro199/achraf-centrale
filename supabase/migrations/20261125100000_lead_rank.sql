-- Best-fit searches stay fast whatever the founder's profile.
-- Before: lead_page scored only investors sharing a sector or keyword with the founder and kept that page only when its
-- lowest score was above 50. Thin profiles (no sector, few keywords, small overlap) fell through to scoring every row of
-- private.lead_search (130 MB, text-array overlaps on 133k rows): 1 to 9 seconds on the throttled instance, past the 8s
-- statement timeout.
-- Now: private.lead_rank holds the scoring inputs in a narrow table (sectors and stages as bitmasks, role, email and
-- empty-stage points pre-added). lead_page ranks all of it for the founder (about 150 ms), takes the top N ids and
-- applies the search filters to just those rows. That page is exact when it fills, because every investor outside the
-- top N ranks below all of them. Selective filters that leave the top N short fall back to the filtered query, which
-- the filter's own index keeps small.
-- Scores are unchanged: lead_rank_score reproduces lead_score_sql exactly.

-- Bit positions for sector (focus) and stage values. New values get the next bit when lead_search rows arrive.
create table if not exists private.lead_bits (
  kind text not null check (kind in ('focus', 'stage')),
  value text not null,
  bit smallint not null check (bit between 0 and 62),
  primary key (kind, value),
  unique (kind, bit)
);

create table if not exists private.lead_rank (
  id bigint primary key,
  fb bigint not null,        -- focus bits
  sb bigint not null,        -- stage bits
  late boolean not null,     -- only late-stage, PE, fund-of-funds or debt stages (early founders lose 20)
  base smallint not null,    -- founder-independent points: role, email, 5 for no listed stage
  kw integer[] not null,
  country text,
  region text
);

alter table private.lead_bits enable row level security;
alter table private.lead_rank enable row level security;
revoke all on private.lead_bits, private.lead_rank from public, anon, authenticated;

create or replace function private.lead_bits_of(p_kind text, p_vals text[])
returns bigint language sql stable set search_path = '' as $$
  select coalesce(bit_or(1::bigint << b.bit), 0) from private.lead_bits b where b.kind = p_kind and b.value = any (p_vals);
$$;

-- Adds bits for values not seen before. Raises if a kind runs past 63 values, so scores never go silently wrong.
create or replace function private.lead_bits_add(p_kind text, p_vals text[])
returns void language plpgsql set search_path = '' as $$
declare
  top smallint;
begin
  perform pg_advisory_xact_lock(hashtext('lead_bits_' || p_kind));
  select coalesce(max(bit), -1) into top from private.lead_bits where kind = p_kind;
  insert into private.lead_bits (kind, value, bit)
  select p_kind, v, top + row_number() over (order by v)
  from (select distinct v from unnest(p_vals) v where v is not null
        except select value from private.lead_bits where kind = p_kind) x;
exception when check_violation then
  raise exception 'lead_bits: more than 63 % values; widen private.lead_rank before importing', p_kind;
end;
$$;

create or replace function private.lead_rank_upsert(p_ids bigint[])
returns void language plpgsql set search_path = '' as $$
begin
  perform private.lead_bits_add('focus', array(select distinct unnest(s.focus) from private.lead_search s where s.id = any (p_ids)));
  perform private.lead_bits_add('stage', array(select distinct unnest(s.stages) from private.lead_search s where s.id = any (p_ids)));
  insert into private.lead_rank as r (id, fb, sb, late, base, kw, country, region)
  select s.id,
    private.lead_bits_of('focus', s.focus),
    private.lead_bits_of('stage', s.stages),
    cardinality(s.stages) > 0 and s.stages <@ array['Buyout/PE', 'Fund of Funds', 'Late Stage', 'Venture Debt'],
    (case s.role when 'partner' then 10 when 'angel' then 10 when 'principal' then 8 when 'venture_partner' then 5
       when 'associate' then 4 when 'operating' then 2 when 'investor_relations' then -20 when 'lp' then -20 else 0 end)
      + (case when s.has_email then 5 else 0 end)
      + (case when cardinality(s.stages) = 0 then 5 else 0 end),
    s.kw, s.country, s.region
  from private.lead_search s where s.id = any (p_ids)
  on conflict (id) do update set fb = excluded.fb, sb = excluded.sb, late = excluded.late, base = excluded.base,
    kw = excluded.kw, country = excluded.country, region = excluded.region;
end;
$$;

create or replace function private.lead_rank_sync()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from private.lead_rank r using old_rows o where r.id = o.id;
  else
    perform private.lead_rank_upsert(array(select n.id from new_rows n));
  end if;
  return null;
end;
$$;

drop trigger if exists lead_rank_ins on private.lead_search;
drop trigger if exists lead_rank_upd on private.lead_search;
drop trigger if exists lead_rank_del on private.lead_search;
create trigger lead_rank_ins after insert on private.lead_search
  referencing new table as new_rows for each statement execute function private.lead_rank_sync();
create trigger lead_rank_upd after update on private.lead_search
  referencing new table as new_rows for each statement execute function private.lead_rank_sync();
create trigger lead_rank_del after delete on private.lead_search
  referencing old table as old_rows for each statement execute function private.lead_rank_sync();

truncate private.lead_rank;
select private.lead_rank_upsert(array(select id from private.lead_search));
analyze private.lead_bits;
analyze private.lead_rank;

-- Top p_n investors for the founder in f, best first, with the same score lead_score_sql gives.
create or replace function private.lead_rank_top(f private.lead_query, p_n integer)
returns table (id bigint, score integer)
language plpgsql stable security definer set search_path = '' set jit = 'off' set work_mem = '64MB'
as $$
declare
  ffb bigint := private.lead_bits_of('focus', coalesce(f.f_focus, '{}'));
  fsb bigint := private.lead_bits_of('stage', coalesce(f.f_stages, '{}'));
  ftb bigint := private.lead_bits_of('stage', coalesce(f.f_types, '{}'));
  nt boolean := cardinality(coalesce(f.f_types, '{}')) = 0;
  fkw integer[] := coalesce(f.f_kw, '{}');
  fc text := f.f_country;
  fr text := f.f_region;
  early boolean := coalesce(f.f_early, false);
begin
  return query
  select x.id, x.sc from (
    select r.id, greatest(0, least(100, r.base
      + (case when r.fb & ffb <> 0 then 30 else 0 end)
      + (case when r.kw operator(extensions.&&) fkw then least(20, extensions.icount(r.kw operator(extensions.&) fkw) * 5) else 0 end)
      + (case when r.sb & fsb <> 0 then 15 else 0 end)
      + (case when nt then 5 when r.sb & ftb <> 0 then 10 else 0 end)
      + (case when r.country = fc then 10 when r.region = fr then 5 else 0 end)
      - (case when early and r.late then 20 else 0 end)))::integer as sc
    from private.lead_rank r
  ) x
  order by x.sc desc, x.id
  limit p_n;
end;
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
  top bigint[];
  last_score integer;
  n integer;
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

  execute format(body, w) into ids, scores using f, lim, off, null::bigint[];
  return query select u.id, u.score from unnest(ids, scores) as u(id, score);
end;
$$;

revoke all on function private.lead_page(private.lead_query, text, text, integer, integer),
  private.lead_rank_top(private.lead_query, integer), private.lead_rank_upsert(bigint[]),
  private.lead_bits_add(text, text[]), private.lead_bits_of(text, text[]), private.lead_rank_sync()
  from public, anon, authenticated;
