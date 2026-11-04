-- Getting ready for live sending.
-- 1. The trial can send 10 emails: can_send is true on a paid plan, or in a running trial until 10 have gone out.
-- 2. sending_allowance() tells the send functions how many trial emails are left.
-- 3. The hourly health check counts bounces (the webhook now marks bounced emails) across all inboxes and per inbox.

create or replace function private.trial_send_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10 $$;

create or replace function private.trial_sends_used(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.outreach_messages where owner_id = p_uid and direction = 'outbound';
$$;
revoke all on function private.trial_sends_used(uuid) from public, anon, authenticated;

create or replace function private.entitlements(p_uid uuid)
 RETURNS TABLE(plan_id text, plan_name text, status text, active boolean, paid boolean, trial_ends_at timestamp with time zone, period_start timestamp with time zone, period_end timestamp with time zone, max_rows integer, page_size_max integer, reveals_total integer, reveals_left integer, exports_total integer, exports_left integer, daily_row_views integer, rows_viewed_today integer, searches_per_minute integer, can_send boolean, manage_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with s as (
    select
      coalesce(sub.plan_id, 'trial') as plan_id,
      coalesce(sub.status, 'pending') as status,
      sub.trial_ends_at,
      coalesce(sub.current_period_start, now()) as ps,
      sub.current_period_end as pe,
      sub.manage_url
    from (select 1) one
    left join public.subscriptions sub on sub.owner_id = p_uid
  ),
  a as (
    select s.*,
      s.status in ('active', 'past_due') as paid,
      s.status = 'trialing' and coalesce(s.trial_ends_at, now()) > now() - interval '1 day' as in_trial
    from s
  ),
  e as (select a.*, case when a.paid then a.plan_id else 'trial' end as limits_plan from a)
  select
    e.plan_id,
    p.name,
    case when e.paid or e.in_trial then e.status when e.status = 'pending' then 'pending' else 'expired' end,
    e.paid or e.in_trial,
    e.paid,
    e.trial_ends_at,
    e.ps,
    e.pe,
    case when e.paid or e.in_trial then p.max_rows else 100 end,
    p.page_size_max,
    case when e.paid then p.reveals_per_period else 0 end,
    case when e.paid then greatest(0, p.reveals_per_period - (
      select count(*) from public.investor_unlocks u where u.owner_id = p_uid and u.source = 'reveal' and u.created_at >= e.ps
    ))::int else 0 end,
    case when e.paid then p.export_credits_per_period else 0 end,
    case when e.paid then greatest(0, p.export_credits_per_period - coalesce((
      select sum(x.credits) from public.export_log x where x.owner_id = p_uid and x.created_at >= e.ps
    ), 0))::int else 0 end,
    case when e.paid or e.in_trial then p.daily_row_views else 300 end,
    coalesce((select u.rows_viewed from private.search_usage u where u.owner_id = p_uid and u.day = current_date), 0),
    p.searches_per_minute,
    e.paid or (e.in_trial and private.trial_sends_used(p_uid) < private.trial_send_limit()),
    e.manage_url
  from e
  join public.plans p on p.id = e.limits_plan;
$function$;
revoke all on function private.entitlements(uuid) from public, anon, authenticated;

-- What the app reads: the entitlements, plus how many trial emails are left (null on a paid plan).
create or replace function public.my_entitlements()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(e) || jsonb_build_object(
    'trial_sends_left', case when e.paid then null else greatest(0, private.trial_send_limit() - private.trial_sends_used(auth.uid())) end,
    'trial_sends_total', private.trial_send_limit()
  )
  from private.entitlements(auth.uid()) e;
$$;

create or replace function public.sending_allowance(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'can_send', e.can_send,
    'paid', e.paid,
    'trial_left', case when e.paid then null else greatest(0, private.trial_send_limit() - private.trial_sends_used(p_uid)) end
  )
  from private.entitlements(p_uid) e;
$$;
revoke all on function public.sending_allowance(uuid) from public, anon, authenticated;
grant execute on function public.sending_allowance(uuid) to service_role;

create or replace function public.ops_snapshot()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'read_only', current_setting('default_transaction_read_only') = 'on',
    'bounces', (
      select jsonb_build_object('sent', count(*), 'bounced', count(*) filter (where status = 'bounced'))
      from public.outreach_messages where direction = 'outbound' and sent_at > now() - interval '7 days'
    ),
    'bounce_inboxes', coalesce((
      select jsonb_agg(jsonb_build_object('address', i.address, 'sent', x.sent, 'bounced', x.bounced))
      from (select inbox_id, count(*) sent, count(*) filter (where status = 'bounced') bounced
            from public.outreach_messages where direction = 'outbound' and sent_at > now() - interval '7 days' group by inbox_id) x
      join public.inboxes i on i.id = x.inbox_id
      where x.sent >= 20 and x.bounced::numeric / x.sent > 0.05
    ), '[]')
  );
$function$;
revoke all on function public.ops_snapshot() from public, anon, authenticated;
grant execute on function public.ops_snapshot() to service_role;
