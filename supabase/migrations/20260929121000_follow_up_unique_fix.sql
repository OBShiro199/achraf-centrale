-- The follow-up upsert uses ON CONFLICT (parent_message_id), which cannot use a partial index, so every
-- save failed and the worker re-drafted the same follow-up each minute. A plain unique index works:
-- first emails have no parent, and NULLs never conflict.
drop index if exists public.scheduled_one_follow_up;
create unique index scheduled_one_follow_up on public.scheduled_emails (parent_message_id);

-- Event-trigger helper; nobody needs to call it over the API.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
