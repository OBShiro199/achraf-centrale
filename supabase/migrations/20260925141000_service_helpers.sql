-- Service-role-only helpers for the private schema, callable from edge functions.

create or replace function public.store_inbox_secret(p_inbox_id text, p_secret text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.inbox_webhook_secrets (openmail_inbox_id, secret)
  values (p_inbox_id, p_secret)
  on conflict (openmail_inbox_id) do update set secret = excluded.secret;
$$;

create or replace function public.get_inbox_secret(p_inbox_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select secret from private.inbox_webhook_secrets where openmail_inbox_id = p_inbox_id;
$$;

-- Returns true the first time an event id is seen, false on retries.
create or replace function public.claim_webhook_event(p_event_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.webhook_events (event_id) values (p_event_id);
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- Pixel opens: first open stamps opened_at, every open bumps the count.
create or replace function public.record_open(p_message_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.outreach_messages
  set opened_at = coalesce(opened_at, now()), open_count = open_count + 1
  where id = p_message_id and direction = 'outbound';
$$;

revoke all on function public.store_inbox_secret(text, text) from public, anon, authenticated;
revoke all on function public.get_inbox_secret(text) from public, anon, authenticated;
revoke all on function public.claim_webhook_event(text) from public, anon, authenticated;
revoke all on function public.record_open(uuid) from public, anon, authenticated;
grant execute on function public.store_inbox_secret(text, text) to service_role;
grant execute on function public.get_inbox_secret(text) to service_role;
grant execute on function public.claim_webhook_event(text) to service_role;
grant execute on function public.record_open(uuid) to service_role;

-- Live reply notifications in the dashboard.
alter publication supabase_realtime add table public.outreach_messages;
