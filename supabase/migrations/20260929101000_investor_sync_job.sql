-- Keeps the investor directory in step with public.contacts. Each run syncs one batch of up to
-- 2,000 changed contacts and returns straight away when nothing has changed.
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'sync-investors';
select cron.schedule('sync-investors', '* * * * *', $$select private.sync_investors_step()$$);
