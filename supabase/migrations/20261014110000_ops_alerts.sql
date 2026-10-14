-- Hourly health check: the ops-alerts function reads this snapshot and emails staff when something needs a look
-- (failed sends, failed cron runs, failed decks, emails stuck in the Outbox, AI and scraping spend over budget).

create table if not exists private.ops_alert_state (
  key text primary key,
  last_sent timestamptz not null
);
alter table private.ops_alert_state enable row level security;
revoke all on private.ops_alert_state from anon, authenticated;

create or replace function public.ops_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'cron_failures', coalesce((
      select jsonb_agg(jsonb_build_object('job', j.jobname, 'runs', x.n, 'last_error', x.msg))
      from (select d.jobid, count(*) n, max(d.return_message) msg from cron.job_run_details d
            where d.status = 'failed' and d.start_time > now() - interval '1 hour' group by d.jobid) x
      join cron.job j on j.jobid = x.jobid
    ), '[]'),
    'failed_sends', (select count(*) from public.scheduled_emails where status = 'failed' and updated_at > now() - interval '1 hour'),
    'stuck_sends', (select count(*) from public.scheduled_emails where status in ('queued', 'sending') and send_after < now() - interval '2 hours'),
    'failed_decks', (select count(*) from public.deck_runs where status = 'error' and started_at > now() - interval '1 hour'),
    'stuck_decks', (select count(*) from public.deck_runs where status = 'running' and started_at < now() - interval '20 minutes'),
    'spend_24h_usd', (select coalesce(round(sum(usd)::numeric, 2), 0) from public.ai_spend where created_at > now() - interval '24 hours'),
    'top_spender_24h', (
      select jsonb_build_object('email', p.email, 'usd', round(x.usd::numeric, 2))
      from (select owner_id, sum(usd) usd from public.ai_spend where created_at > now() - interval '24 hours' group by owner_id order by 2 desc limit 1) x
      left join public.profiles p on p.id = x.owner_id
    ),
    'db_size_mb', (select round(pg_database_size(current_database()) / 1048576.0)),
    'read_only', current_setting('default_transaction_read_only') = 'on'
  );
$$;
revoke all on function public.ops_snapshot() from public, anon, authenticated;
grant execute on function public.ops_snapshot() to service_role;

-- Records that an alert went out, so each problem emails at most once every 6 hours. Returns true when it should send.
create or replace function public.ops_alert_due(p_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  last timestamptz;
begin
  select last_sent into last from private.ops_alert_state where key = p_key;
  if last is not null and last > now() - interval '6 hours' then return false; end if;
  insert into private.ops_alert_state (key, last_sent) values (p_key, now())
  on conflict (key) do update set last_sent = excluded.last_sent;
  return true;
end;
$$;
revoke all on function public.ops_alert_due(text) from public, anon, authenticated;
grant execute on function public.ops_alert_due(text) to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'ops-alerts';
select cron.schedule(
  'ops-alerts',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://tldvqiqucfmlnkgxaufy.supabase.co/functions/v1/ops-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
