-- Outbox: queued first emails (batch outreach) and automatic follow-ups, sent by a worker.

-- Manual reply testing goes to the owner's external address, not another founder inbox.
update public.investors set email = 'oburt5669@gmail.com'
where full_name = 'Rosa Wells' and firm = 'Centrale Test Desk';

-- Founder settings for follow-ups.
alter table public.startups
  add column auto_follow_up boolean not null default true,
  add column follow_up_days integer not null default 3 check (follow_up_days between 1 and 14);
grant update (auto_follow_up, follow_up_days) on public.startups to authenticated;

-- What kind of outbound message a row is, so follow-ups only chase first emails.
alter table public.outreach_messages
  add column kind text not null default 'first' check (kind in ('first', 'reply', 'follow_up'));
update public.outreach_messages set kind = 'reply' where direction = 'outbound' and subject ilike 're:%';

create table public.scheduled_emails (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  investor_id uuid not null references public.investors (id) on delete cascade,
  kind text not null check (kind in ('first', 'follow_up')),
  -- For follow-ups: the email being chased and its OpenMail thread.
  parent_message_id uuid references public.outreach_messages (id) on delete cascade,
  thread_id text,
  subject text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'cancelled', 'failed')),
  send_after timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  outreach_message_id uuid references public.outreach_messages (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index scheduled_one_follow_up on public.scheduled_emails (parent_message_id) where kind = 'follow_up';
create index scheduled_due_idx on public.scheduled_emails (status, send_after);
create index scheduled_owner_idx on public.scheduled_emails (owner_id, created_at desc);
create index scheduled_investor_idx on public.scheduled_emails (investor_id);
create index scheduled_outreach_idx on public.scheduled_emails (outreach_message_id);

create trigger scheduled_emails_touch before update on public.scheduled_emails
  for each row execute function private.touch_updated_at();

alter table public.scheduled_emails enable row level security;

create policy "own scheduled read" on public.scheduled_emails
  for select to authenticated using ((select auth.uid()) = owner_id);
-- Founders queue first emails; follow-ups are only ever created by the worker.
create policy "own scheduled insert" on public.scheduled_emails
  for insert to authenticated
  with check ((select auth.uid()) = owner_id and kind = 'first' and status = 'queued');
-- Founders can edit, reschedule or cancel anything still waiting.
create policy "own scheduled update" on public.scheduled_emails
  for update to authenticated
  using ((select auth.uid()) = owner_id and status = 'queued')
  with check ((select auth.uid()) = owner_id and status in ('queued', 'cancelled'));

revoke insert, update on public.scheduled_emails from authenticated;
grant insert (owner_id, investor_id, kind, subject, body, send_after) on public.scheduled_emails to authenticated;
grant update (subject, body, status, send_after) on public.scheduled_emails to authenticated;

alter publication supabase_realtime add table public.scheduled_emails;

-- Worker helpers (service role only) ----------------------------------------------

-- Atomically claims due emails so two worker runs never send the same one.
create or replace function public.claim_due_emails(p_limit integer default 25)
returns setof public.scheduled_emails
language sql
security definer
set search_path = ''
as $$
  update public.scheduled_emails s
  set status = 'sending', attempts = s.attempts + 1
  where s.id in (
    select id from public.scheduled_emails
    where status = 'queued' and send_after <= now()
    order by send_after
    limit p_limit
    for update skip locked
  )
  returning s.*;
$$;

-- First emails old enough to chase, with no reply and no follow-up planned yet.
-- Planned 12 hours before they are due so founders see them in the Outbox first.
create or replace function public.follow_up_candidates(p_limit integer default 20)
returns table (
  message_id uuid, owner_id uuid, investor_id uuid, thread_id text,
  subject text, body text, sent_at timestamptz, follow_up_days integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.owner_id, o.investor_id, o.openmail_thread_id, o.subject, o.body, o.sent_at, s.follow_up_days
  from public.outreach_messages o
  join public.startups s on s.owner_id = o.owner_id
  where o.direction = 'outbound'
    and o.kind = 'first'
    and o.investor_id is not null
    and o.openmail_thread_id is not null
    and s.auto_follow_up
    and o.sent_at <= now() - make_interval(days => s.follow_up_days) + interval '12 hours'
    and o.sent_at >= now() - interval '21 days'
    and not exists (
      select 1 from public.outreach_messages r
      where r.direction = 'inbound'
        and (r.openmail_thread_id = o.openmail_thread_id or (r.owner_id = o.owner_id and r.investor_id = o.investor_id))
    )
    and not exists (select 1 from public.scheduled_emails f where f.parent_message_id = o.id)
  order by o.sent_at
  limit p_limit;
$$;

revoke all on function public.claim_due_emails(integer) from public, anon, authenticated;
revoke all on function public.follow_up_candidates(integer) from public, anon, authenticated;
grant execute on function public.claim_due_emails(integer) to service_role;
grant execute on function public.follow_up_candidates(integer) to service_role;

-- Generated pitch decks ----------------------------------------------------------
alter table public.startups
  add column deck_inputs jsonb,
  add column deck_slides jsonb,
  add column generated_deck_path text,
  add column generated_deck_at timestamptz,
  add column deck_status text not null default 'idle' check (deck_status in ('idle', 'running', 'done', 'error')),
  add column deck_error text;
grant update (deck_inputs) on public.startups to authenticated;
