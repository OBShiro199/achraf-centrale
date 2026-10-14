-- Meeting booking (PRD "What to add next"). A founder saves a booking link (Calendly, Cal.com, Google
-- appointment pages and so on). Drafts invite investors to use it, sent emails route it through a click
-- counter, and the pipeline shows who opened it. Booked meetings do not move stages yet: that needs the
-- calendar provider's webhooks.

alter table public.startups add column if not exists calendar_url text
  check (calendar_url is null or (calendar_url ~ '^https://[^\s]+$' and char_length(calendar_url) <= 500));
grant update (calendar_url) on public.startups to authenticated;

alter table public.outreach_messages add column if not exists calendar_clicked_at timestamptz;
alter table public.outreach_messages add column if not exists calendar_clicks integer not null default 0;

-- Counts a click on the booking link in one email and returns where to send the investor.
create or replace function public.record_calendar_click(p_message_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  with m as (
    update public.outreach_messages
    set calendar_clicked_at = coalesce(calendar_clicked_at, now()), calendar_clicks = calendar_clicks + 1
    where id = p_message_id and direction = 'outbound'
    returning owner_id
  )
  select s.calendar_url from m join public.startups s on s.owner_id = m.owner_id;
$$;
revoke all on function public.record_calendar_click(uuid) from public, anon, authenticated;
grant execute on function public.record_calendar_click(uuid) to service_role;

-- The pipeline board gains when the investor last opened the booking link.
drop function if exists public.pipeline_board();
create function public.pipeline_board()
returns table (
  investor_id bigint, full_name text, title text, firm text, has_email boolean, stage text,
  note text, next_step text, next_step_on date, last_sent_at timestamptz, last_reply_at timestamptz,
  thread_id text, updated_at timestamptz, calendar_clicked_at timestamptz
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
      max(m.calendar_clicked_at) as calendar_clicked,
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
    greatest(p.updated_at, o.last_sent, o.last_reply, o.calendar_clicked),
    o.calendar_clicked
  from ids
  join public.investors_achraf a on a.id = ids.investor_id
  cross join me
  left join public.pipeline p on p.owner_id = me.uid and p.investor_id = ids.investor_id
  left join o on o.investor_id = ids.investor_id
  where me.uid is not null
    and not exists (select 1 from private.investor_removals r where r.investor_id = ids.investor_id)
  order by greatest(p.updated_at, o.last_sent, o.last_reply, o.calendar_clicked) desc nulls last;
$$;
revoke all on function public.pipeline_board() from public, anon;
grant execute on function public.pipeline_board() to authenticated;
