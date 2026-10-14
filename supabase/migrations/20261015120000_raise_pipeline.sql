-- Raise pipeline (PRD "What to add next"). Each founder tracks investors through stages, with a note and a
-- next step. Investors appear on the board automatically once emailed; founders can also add them by hand.
-- Activity moves a card forward (a reply moves "contacted" to "replied") but never back, and "passed" sticks.

create table if not exists public.pipeline (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  investor_id bigint not null references public.investors_achraf(id) on delete cascade,
  stage text not null default 'to_contact'
    check (stage in ('to_contact', 'contacted', 'replied', 'meeting', 'diligence', 'term_sheet', 'committed', 'passed')),
  note text check (char_length(note) <= 5000),
  next_step text check (char_length(next_step) <= 200),
  next_step_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, investor_id)
);
drop trigger if exists pipeline_touch on public.pipeline;
create trigger pipeline_touch before update on public.pipeline for each row execute function private.touch_updated_at();
alter table public.pipeline enable row level security;
drop policy if exists "own pipeline" on public.pipeline;
create policy "own pipeline" on public.pipeline for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
grant select, insert, update, delete on public.pipeline to authenticated;

create or replace function private.pipeline_rank(p_stage text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select array_position(array['to_contact', 'contacted', 'replied', 'meeting', 'diligence', 'term_sheet', 'committed'], p_stage);
$$;

-- The signed-in founder's board: every investor they emailed or added, with the stage, their notes and the
-- latest email activity.
create or replace function public.pipeline_board()
returns table (
  investor_id bigint, full_name text, title text, firm text, has_email boolean, stage text,
  note text, next_step text, next_step_on date, last_sent_at timestamptz, last_reply_at timestamptz,
  thread_id text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid),
  o as (
    select m.investor_id,
      max(m.sent_at) filter (where m.direction = 'outbound') as last_sent,
      max(m.sent_at) filter (where m.direction = 'inbound') as last_reply,
      (array_agg(m.openmail_thread_id order by m.sent_at desc) filter (where m.openmail_thread_id is not null))[1] as thread_id
    from public.outreach_messages m, me
    where m.owner_id = me.uid and m.investor_id is not null
    group by m.investor_id
  ),
  ids as (
    select o.investor_id from o
    union
    select p.investor_id from public.pipeline p, me where p.owner_id = me.uid
  )
  select ids.investor_id, a.full_name, a.title, a.firm, coalesce(a.email, '') <> '',
    case
      when p.stage = 'passed' then 'passed'
      else (array['to_contact', 'contacted', 'replied', 'meeting', 'diligence', 'term_sheet', 'committed'])[greatest(
        coalesce(private.pipeline_rank(p.stage), 1),
        case when o.last_reply is not null then 3 when o.last_sent is not null then 2 else 1 end
      )]
    end,
    p.note, p.next_step, p.next_step_on, o.last_sent, o.last_reply, o.thread_id,
    greatest(p.updated_at, o.last_sent, o.last_reply)
  from ids
  join public.investors_achraf a on a.id = ids.investor_id
  cross join me
  left join public.pipeline p on p.owner_id = me.uid and p.investor_id = ids.investor_id
  left join o on o.investor_id = ids.investor_id
  where me.uid is not null
    and not exists (select 1 from private.investor_removals r where r.investor_id = ids.investor_id)
  order by greatest(p.updated_at, o.last_sent, o.last_reply) desc nulls last;
$$;
revoke all on function public.pipeline_board() from public, anon;
grant execute on function public.pipeline_board() to authenticated;
