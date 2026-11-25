-- Trial nudges: on days 1, 3 and 6 of the 7-day trial, the trial-nudges function emails each founder the next
-- things to do (email their first 10, connect LinkedIn or WhatsApp, make a call), so they have conversations going
-- before the first payment. Each nudge goes once per founder; private.trial_nudges records it.

create table if not exists private.trial_nudges (
  owner_id uuid not null references auth.users(id) on delete cascade,
  day integer not null check (day in (1, 3, 6)),
  sent_at timestamptz not null default now(),
  primary key (owner_id, day)
);
alter table private.trial_nudges enable row level security;
revoke all on private.trial_nudges from anon, authenticated;

-- Founders in a running trial who are due a nudge today, with what they have done so far.
create or replace function public.trial_nudge_candidates()
returns table (
  owner_id uuid, email text, first_name text, day integer, trial_ends_at timestamptz, plan_id text,
  investors_emailed integer, replies integer, linkedin boolean, whatsapp boolean, calls integer, has_number boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select s.owner_id, s.trial_ends_at, s.plan_id,
      case
        when now() - (s.trial_ends_at - interval '7 days') between interval '1 day' and interval '2 days' then 1
        when now() - (s.trial_ends_at - interval '7 days') between interval '3 days' and interval '4 days' then 3
        when now() - (s.trial_ends_at - interval '7 days') between interval '6 days' and interval '7 days' then 6
      end as day
    from public.subscriptions s
    where s.status = 'trialing' and s.trial_ends_at > now()
  )
  select t.owner_id, p.email, p.first_name, t.day, t.trial_ends_at, t.plan_id,
    (select count(distinct m.investor_id)::int from public.outreach_messages m where m.owner_id = t.owner_id and m.direction = 'outbound' and m.status <> 'test'),
    (select count(*)::int from public.conversations c where c.owner_id = t.owner_id and c.last_direction = 'inbound'),
    exists (select 1 from public.channel_accounts a where a.owner_id = t.owner_id and a.provider = 'linkedin' and a.status = 'ok'),
    exists (select 1 from public.channel_accounts a where a.owner_id = t.owner_id and a.provider = 'whatsapp' and a.status = 'ok'),
    (select count(*)::int from public.calls c where c.owner_id = t.owner_id),
    exists (select 1 from public.phone_numbers n where n.owner_id = t.owner_id and n.status = 'active')
  from t
  join public.profiles p on p.id = t.owner_id
  where t.day is not null
    and p.email is not null
    and not exists (select 1 from private.trial_nudges n where n.owner_id = t.owner_id and n.day = t.day);
$$;
revoke all on function public.trial_nudge_candidates() from public, anon, authenticated;
grant execute on function public.trial_nudge_candidates() to service_role;

-- Claims a nudge before it is sent, so two runs can never send it twice. True when this run should send it.
create or replace function public.claim_trial_nudge(p_owner uuid, p_day integer)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with ins as (
    insert into private.trial_nudges (owner_id, day) values (p_owner, p_day) on conflict do nothing returning 1
  )
  select exists (select 1 from ins);
$$;
revoke all on function public.claim_trial_nudge(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_trial_nudge(uuid, integer) to service_role;

-- Every hour, so each founder hears from us at about the time of day they signed up.
select cron.unschedule('trial-nudges') where exists (select 1 from cron.job where jobname = 'trial-nudges');
select cron.schedule(
  'trial-nudges',
  '23 * * * *',
  $$
  select net.http_post(
    url := 'https://tldvqiqucfmlnkgxaufy.supabase.co/functions/v1/trial-nudges',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
