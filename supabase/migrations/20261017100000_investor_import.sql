-- Investor imports in one command (PRD reliability: "Investor imports"). scripts/import-investors.mjs sends
-- batches to import_investors(), which inserts new rows into investors_achraf, skips anyone already listed (same
-- email or LinkedIn URL) or removed at their own request, and refreshes the search rows for that batch.
-- import_finish() then refreshes the filter counts. Directory rebuilds now skip removed investors too.

-- Rebuilds skip investors who asked to be removed.
do $$
declare
  def text;
  p1 text;
  p2 text;
begin
  select pg_get_functiondef('private.refresh_lead_search_range(bigint, bigint)'::regprocedure) into def;
  p1 := replace(def,
    $a$  from public.investors_achraf a
  where a.id between p_lo and p_hi;$a$,
    $b$  from public.investors_achraf a
  where a.id between p_lo and p_hi
    and not exists (select 1 from private.investor_removals r where r.investor_id = a.id);$b$);
  if p1 = def then raise exception 'Could not patch the lead_search insert'; end if;
  p2 := replace(p1,
    $a$  where a.id between p_lo and p_hi
    and (a.headline is not null$a$,
    $b$  where a.id between p_lo and p_hi
    and not exists (select 1 from private.investor_removals r where r.investor_id = a.id)
    and (a.headline is not null$b$);
  if p2 = p1 then raise exception 'Could not patch the lead_text insert'; end if;
  execute p2;
end $$;

create index if not exists investors_achraf_linkedin_lower on public.investors_achraf (lower(linkedin_url)) where linkedin_url is not null and linkedin_url <> '';

-- Inserts one batch (a JSON array of objects whose keys are investors_achraf columns; unknown keys are ignored
-- and any id given is replaced). Only columns present in the batch are written, so column defaults still apply.
-- Returns counts and the id range added.
create or replace function public.import_investors(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '120s'
as $$
declare
  base bigint;
  lo bigint;
  hi bigint;
  added integer;
  total integer;
  cols text;
  vals text;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Send a JSON array of rows'; end if;
  total := jsonb_array_length(p_rows);
  if total > 2000 then raise exception 'Send at most 2000 rows a batch'; end if;

  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position),
         string_agg('(k.r).' || quote_ident(c.column_name), ', ' order by c.ordinal_position)
  into cols, vals
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'investors_achraf' and c.column_name <> 'id'
    and exists (select 1 from jsonb_array_elements(p_rows) e where e ? c.column_name);
  if cols is null then raise exception 'No row has a known investors_achraf column'; end if;

  lock table public.investors_achraf in share row exclusive mode;
  select coalesce(max(id), 0) into base from public.investors_achraf;

  drop table if exists pg_temp.import_keep;
  create temp table import_keep on commit drop as
  with incoming as (
    select r, ord from jsonb_populate_recordset(null::public.investors_achraf, p_rows) with ordinality as x(r, ord)
  ), fresh as (
    select r, ord, lower(nullif(trim((r).email), '')) as em, lower(nullif(trim((r).linkedin_url), '')) as li
    from incoming
  )
  select f.r, base + row_number() over (order by f.ord) as new_id
  from fresh f
  where (f.em is not null or f.li is not null)
    and not exists (select 1 from public.investors_achraf a where f.em is not null and lower(a.email) = f.em and a.email <> '')
    and not exists (select 1 from public.investors_achraf a where f.li is not null and lower(a.linkedin_url) = f.li and a.linkedin_url <> '')
    and not exists (select 1 from private.investor_removals x where f.em is not null and x.email = f.em)
    -- First of any duplicates inside the batch itself.
    and not exists (select 1 from fresh g where g.ord < f.ord and ((f.em is not null and g.em = f.em) or (f.li is not null and g.li = f.li)));

  execute format('insert into public.investors_achraf (id, %s) select k.new_id, %s from pg_temp.import_keep k', cols, vals);
  get diagnostics added = row_count;

  if added > 0 then
    lo := base + 1;
    hi := base + added;
    perform private.refresh_lead_search_range(lo, hi);
  end if;
  return jsonb_build_object('received', total, 'added', added, 'skipped', total - added, 'first_id', lo, 'last_id', hi);
end;
$$;

-- After the last batch: refresh the filter counts and table statistics.
create or replace function public.import_finish()
returns integer
language sql
security definer
set search_path = ''
set statement_timeout = '300s'
as $$
  select private.refresh_lead_facets();
$$;

revoke all on function public.import_investors(jsonb) from public, anon, authenticated;
revoke all on function public.import_finish() from public, anon, authenticated;
grant execute on function public.import_investors(jsonb) to service_role;
grant execute on function public.import_finish() to service_role;
