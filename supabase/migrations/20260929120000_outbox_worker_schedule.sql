-- Outbox worker every minute. Sends to real directory investors are redirected to the test inbox
-- (oliverburt3+centraletest@gmail.com) until the Vault secret OUTREACH_LIVE is "true".
create extension if not exists pg_net with schema extensions;
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'CRON_SECRET') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'CRON_SECRET');
  end if;
end $$;
select cron.unschedule(jobid) from cron.job where jobname = 'process-outbox';
select cron.schedule(
  'process-outbox',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://tldvqiqucfmlnkgxaufy.supabase.co/functions/v1/process-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
