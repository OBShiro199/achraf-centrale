-- Admin console (PRD "What to add next"). One staff-only read of founders, sending, deliverability, removals
-- and health, so staff stop reading tables by hand. Returns null to anyone who is not staff.

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cap integer;
begin
  if not private.is_staff(auth.uid()) then return null; end if;
  begin
    cap := nullif(public.get_app_secret('OPENMAIL_ACCOUNT_DAILY_CAP'), '')::integer;
  exception when others then cap := null;
  end;

  return jsonb_build_object(
    'founders', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      'by_plan', coalesce((
        select jsonb_agg(jsonb_build_object('plan', plan_id, 'status', status, 'n', n) order by n desc)
        from (select plan_id, status, count(*) n from public.subscriptions group by 1, 2) x
      ), '[]')
    ),
    'sending', jsonb_build_object(
      'today', (select count(*) from public.outreach_messages where direction = 'outbound' and sent_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'),
      'cap', coalesce(cap, 150),
      'queued', (select count(*) from public.scheduled_emails where status = 'queued'),
      'by_day', coalesce((
        select jsonb_agg(jsonb_build_object('day', d, 'sent', sent, 'replies', replies) order by d)
        from (
          select (sent_at at time zone 'utc')::date d,
            count(*) filter (where direction = 'outbound') sent,
            count(*) filter (where direction = 'inbound') replies
          from public.outreach_messages where sent_at > now() - interval '14 days' group by 1
        ) x
      ), '[]')
    ),
    'deliverability', jsonb_build_object(
      'suppressed', coalesce((
        select jsonb_object_agg(reason, n) from (select reason, count(*) n from public.email_suppressions group by 1) x
      ), '{}'),
      'suppressed_7d', (select count(*) from public.email_suppressions where created_at > now() - interval '7 days'),
      'failed_7d', (select count(*) from public.scheduled_emails where status = 'failed' and updated_at > now() - interval '7 days'),
      'removals', (select count(*) from private.investor_removals),
      'removal_requests_pending', (select count(*) from private.removal_requests where confirmed_at is null and created_at > now() - interval '48 hours')
    ),
    'health', public.ops_snapshot(),
    'recent', coalesce((
      select jsonb_agg(r order by r.signed_up desc)
      from (
        select p.email, p.created_at as signed_up, s.plan_id as plan, s.status,
          st.name as startup, i.address as inbox,
          (select count(*) from public.deck_runs d where d.owner_id = p.id and d.status = 'done') as decks,
          (select count(*) from public.outreach_messages m where m.owner_id = p.id and m.direction = 'outbound') as sent,
          (select count(*) from public.outreach_messages m where m.owner_id = p.id and m.direction = 'inbound') as replies,
          (select max(m.sent_at) from public.outreach_messages m where m.owner_id = p.id and m.direction = 'outbound') as last_sent,
          (select coalesce(sum(a.usd), 0) from public.ai_spend a where a.owner_id = p.id) as spend_usd
        from public.profiles p
        left join public.subscriptions s on s.owner_id = p.id
        left join public.startups st on st.owner_id = p.id
        left join public.inboxes i on i.owner_id = p.id and i.status = 'active'
        order by p.created_at desc
        limit 100
      ) r
    ), '[]')
  );
end;
$$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
