-- Outreach analytics (PRD "What to add next"). For the signed-in founder: of the investors they emailed, how
-- many opened, replied and reached a meeting, overall and by sector, stage, region and role. Groups under 3
-- investors are left out, since a rate from 1 or 2 emails says nothing.

create or replace function public.outreach_breakdown()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid),
  c as (
    select m.investor_id,
      bool_or(m.direction = 'inbound') as replied,
      bool_or(m.direction = 'outbound' and m.opened_at is not null) as opened
    from public.outreach_messages m, me
    where m.owner_id = me.uid and m.investor_id is not null
    group by m.investor_id
    having bool_or(m.direction = 'outbound')
  ),
  j as (
    select c.*, s.region, s.role, s.focus, s.stages,
      coalesce(private.pipeline_rank(p.stage), 0) >= 4 as meeting
    from c
    cross join me
    left join private.lead_search s on s.id = c.investor_id
    left join public.pipeline p on p.owner_id = me.uid and p.investor_id = c.investor_id
  ),
  g as (
    select 'sector' as dim, f as val, replied, opened, meeting from j, unnest(j.focus) f
    union all select 'stage', st, replied, opened, meeting from j, unnest(j.stages) st
    union all select 'region', region, replied, opened, meeting from j where region is not null
    union all select 'role', role, replied, opened, meeting from j where role is not null
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'contacted', count(*), 'opened', count(*) filter (where opened),
        'replied', count(*) filter (where replied), 'meetings', count(*) filter (where meeting))
      from j
    ),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('dim', dim, 'value', val, 'contacted', n, 'replied', r, 'meetings', mt) order by dim, n desc)
      from (
        select dim, val, count(*) n, count(*) filter (where replied) r, count(*) filter (where meeting) mt
        from g group by dim, val having count(*) >= 3
      ) x
    ), '[]')
  )
  where (select uid from me) is not null;
$$;
revoke all on function public.outreach_breakdown() from public, anon;
grant execute on function public.outreach_breakdown() to authenticated;
