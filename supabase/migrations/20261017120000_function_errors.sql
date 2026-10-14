-- Edge function failures, so the hourly health check sees problems that only show in logs today: Whop and
-- OpenMail webhooks failing (a bad signing secret, a schema change) and any function throwing.
-- The shared serve() wrapper records every 5xx, and every 4xx from a webhook. Rows older than 14 days are cleared.

create table if not exists private.function_errors (
  id bigint generated always as identity primary key,
  fn text not null,
  status integer not null,
  message text,
  created_at timestamptz not null default now()
);
create index if not exists function_errors_recent on private.function_errors (created_at desc);
alter table private.function_errors enable row level security;
revoke all on private.function_errors from anon, authenticated;

create or replace function public.record_function_error(p_fn text, p_status integer, p_message text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.function_errors where created_at < now() - interval '14 days';
  insert into private.function_errors (fn, status, message) values (left(p_fn, 60), p_status, left(p_message, 500));
$$;

-- Failures in the last hour, per function, with the latest message.
create or replace function public.function_error_counts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('fn', fn, 'n', n, 'last', last) order by n desc), '[]')
  from (
    select fn, count(*) n, (array_agg(status || ' ' || coalesce(message, '') order by created_at desc))[1] last
    from private.function_errors where created_at > now() - interval '1 hour' group by fn
  ) x;
$$;

revoke all on function public.record_function_error(text, integer, text), public.function_error_counts() from public, anon, authenticated;
grant execute on function public.record_function_error(text, integer, text), public.function_error_counts() to service_role;
