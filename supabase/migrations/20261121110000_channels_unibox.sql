-- Multichannel outreach: LinkedIn and WhatsApp through Unipile (the founder's own accounts), calls from a US number
-- through Telnyx, and one inbox (the Unibox) for every conversation, email included.
--
--   channel_accounts   a founder's connected LinkedIn or WhatsApp account at Unipile
--   phone_numbers      a founder's US number at Telnyx, with the SIP credential their browser dials with
--   conversations      one thread per founder, investor and channel; email threads are mirrored here too
--   channel_messages   messages in LinkedIn and WhatsApp conversations (email bodies stay at OpenMail)
--   calls              each call: recording, transcript, summary and Claude's outcome tag
--   sending_domains    (existing) now also records domains Centrale bought for a founder during onboarding
--
-- Every table is read-only to the founder who owns it; edge functions write with the service role.

create table if not exists public.channel_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('linkedin', 'whatsapp')),
  unipile_account_id text unique,
  status text not null default 'connecting' check (status in ('connecting', 'ok', 'credentials', 'error', 'disconnected')),
  display_name text,
  status_message text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists channel_accounts_one_per_provider on public.channel_accounts (owner_id, provider) where status <> 'disconnected';

create table if not exists public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  e164 text not null,
  telnyx_number_id text,
  telnyx_order_id text,
  telnyx_credential_id text,
  sip_username text,
  status text not null default 'active' check (status in ('ordering', 'active', 'released', 'failed')),
  last_error text,
  created_at timestamptz not null default now(),
  released_at timestamptz
);
create unique index if not exists phone_numbers_one_active on public.phone_numbers (owner_id) where status in ('ordering', 'active');

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  investor_id bigint references public.investors_achraf(id) on delete set null,
  channel text not null check (channel in ('email', 'linkedin', 'whatsapp', 'phone')),
  external_id text not null,
  title text,
  contact_name text,
  contact_handle text,
  last_message_at timestamptz not null default now(),
  last_preview text,
  last_direction text check (last_direction in ('inbound', 'outbound')),
  unread boolean not null default false,
  outcome text check (outcome in ('interested', 'meeting', 'call_back', 'not_now', 'not_interested', 'voicemail', 'no_answer')),
  outcome_source text check (outcome_source in ('ai', 'founder')),
  outcome_reason text,
  created_at timestamptz not null default now(),
  unique (owner_id, channel, external_id)
);
create index if not exists conversations_owner_recent on public.conversations (owner_id, last_message_at desc);
create index if not exists conversations_investor on public.conversations (owner_id, investor_id);

create table if not exists public.channel_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  kind text not null default 'message' check (kind in ('message', 'invite', 'inmail')),
  body text not null default '',
  external_id text unique,
  status text not null default 'sent',
  sent_at timestamptz not null default now()
);
create index if not exists channel_messages_conversation on public.channel_messages (conversation_id, sent_at);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  investor_id bigint references public.investors_achraf(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  phone_number_id uuid references public.phone_numbers(id) on delete set null,
  from_number text not null,
  to_number text not null,
  telnyx_call_session_id text unique,
  telnyx_call_leg_id text,
  status text not null default 'dialing' check (status in ('dialing', 'ringing', 'answered', 'completed', 'no_answer', 'busy', 'failed')),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  recording_path text,
  transcript text,
  summary text,
  outcome text check (outcome in ('interested', 'meeting', 'call_back', 'not_now', 'not_interested', 'voicemail', 'no_answer')),
  outcome_source text check (outcome_source in ('ai', 'founder')),
  notes text check (char_length(notes) <= 5000)
);
create index if not exists calls_owner_recent on public.calls (owner_id, started_at desc);

-- Domains Centrale buys for a founder at signup live in the existing sending_domains table, marked here.
alter table public.sending_domains
  add column if not exists bought_by_centrale boolean not null default false,
  add column if not exists registrar text,
  add column if not exists price_usd numeric(8, 2),
  add column if not exists expires_at timestamptz;

drop trigger if exists channel_accounts_touch on public.channel_accounts;
create trigger channel_accounts_touch before update on public.channel_accounts for each row execute function private.touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['channel_accounts', 'phone_numbers', 'conversations', 'channel_messages', 'calls'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for select to authenticated using ((select auth.uid()) = owner_id)', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Founders mark a conversation read and correct an outcome themselves; nothing else is writable from the browser.
grant update (unread, outcome, outcome_source) on public.conversations to authenticated;
drop policy if exists "own conversations update" on public.conversations;
create policy "own conversations update" on public.conversations for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
grant update (outcome, outcome_source, notes) on public.calls to authenticated;
drop policy if exists "own calls update" on public.calls;
create policy "own calls update" on public.calls for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- Live updates for the Unibox.
do $$
begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null;
end $$;

-- Private bucket for call recordings, one folder per founder; links are signed by the calls function.
insert into storage.buckets (id, name, public, file_size_limit)
values ('call-recordings', 'call-recordings', false, 104857600)
on conflict (id) do nothing;

-- A positive outcome moves the investor forward on the raise pipeline (never back, and never out of passed).
create or replace function private.advance_pipeline(p_owner uuid, p_investor bigint, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text := case p_outcome
    when 'meeting' then 'meeting'
    when 'interested' then 'replied'
    when 'call_back' then 'replied'
    when 'not_interested' then 'passed'
    else null end;
begin
  if p_investor is null or target is null then return; end if;
  insert into public.pipeline (owner_id, investor_id, stage) values (p_owner, p_investor, target)
  on conflict (owner_id, investor_id) do update set stage = excluded.stage
  where public.pipeline.stage <> 'passed'
    and (excluded.stage = 'passed' and public.pipeline.stage in ('to_contact', 'contacted', 'replied')
         or private.pipeline_rank(excluded.stage) > private.pipeline_rank(public.pipeline.stage));
end;
$$;
revoke all on function private.advance_pipeline(uuid, bigint, text) from public, anon, authenticated;

create or replace function public.advance_pipeline(p_owner uuid, p_investor bigint, p_outcome text)
returns void
language sql
security definer
set search_path = ''
as $$ select private.advance_pipeline(p_owner, p_investor, p_outcome); $$;
revoke all on function public.advance_pipeline(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.advance_pipeline(uuid, bigint, text) to service_role;

-- Email threads sent before the Unibox existed, so the founder's history is there on day one.
insert into public.conversations (owner_id, investor_id, channel, external_id, title, contact_name, contact_handle, last_message_at, last_preview, last_direction, unread)
select distinct on (m.owner_id, m.openmail_thread_id)
  m.owner_id, x.investor_id, 'email', m.openmail_thread_id, m.subject, i.full_name,
  case when m.direction = 'inbound' then m.from_addr else m.to_addr end,
  m.sent_at, left(regexp_replace(coalesce(m.body, ''), '\s+', ' ', 'g'), 240), m.direction, false
from public.outreach_messages m
left join lateral (
  select o.investor_id from public.outreach_messages o
  where o.owner_id = m.owner_id and o.openmail_thread_id = m.openmail_thread_id and o.investor_id is not null limit 1
) x on true
left join public.investors_achraf i on i.id = x.investor_id
where m.openmail_thread_id is not null
order by m.owner_id, m.openmail_thread_id, m.sent_at desc
on conflict (owner_id, channel, external_id) do nothing;

-- Email follow-ups stop for investors who answered on another channel.
create or replace function public.follow_up_candidates(p_limit integer default 20)
returns table (message_id uuid, owner_id uuid, investor_id bigint, thread_id text, subject text, body text, sent_at timestamptz, follow_up_days integer)
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
    and o.status not in ('test', 'bounced')
    and o.investor_id is not null
    and o.openmail_thread_id is not null
    and s.auto_follow_up
    and exists (select 1 from private.entitlements(o.owner_id) e where e.can_send)
    and o.sent_at <= now() - make_interval(days => s.follow_up_days) + interval '12 hours'
    and o.sent_at >= now() - interval '21 days'
    and not exists (
      select 1 from public.outreach_messages r
      where r.direction = 'inbound'
        and (r.openmail_thread_id = o.openmail_thread_id or (r.owner_id = o.owner_id and r.investor_id = o.investor_id))
    )
    and not exists (select 1 from public.scheduled_emails f where f.parent_message_id = o.id)
    -- An answer on LinkedIn or WhatsApp, or a call they picked up, counts as a reply too.
    and not exists (
      select 1 from public.channel_messages cm join public.conversations cv on cv.id = cm.conversation_id
      where cv.owner_id = o.owner_id and cv.investor_id = o.investor_id and cm.direction = 'inbound'
    )
    and not exists (select 1 from public.calls c where c.owner_id = o.owner_id and c.investor_id = o.investor_id and c.status = 'completed')
  order by o.sent_at
  limit p_limit;
$$;
revoke all on function public.follow_up_candidates(integer) from public, anon, authenticated;
grant execute on function public.follow_up_candidates(integer) to service_role;
