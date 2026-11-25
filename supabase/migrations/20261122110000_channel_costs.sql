-- Monthly channel costs, accrued a day at a time into public.ai_spend so Running costs and the admin console show
-- what each founder costs: a Telnyx US number ($1 a month) and each LinkedIn or WhatsApp account linked at Unipile
-- (about €5, $5.50, a month; Unipile bills every linked account whatever its status). One-off costs (number setup,
-- call minutes, domains) are recorded by the edge functions when they happen.

create or replace function private.accrue_channel_costs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  c integer;
begin
  -- Once a day; a second run on the same day adds nothing.
  if exists (select 1 from public.ai_spend where feature in ('phone_number_daily', 'linked_account') and created_at >= current_date) then
    return 0;
  end if;
  insert into public.ai_spend (owner_id, feature, ref_id, usd)
  select owner_id, 'phone_number_daily', id, round(1.0 / 30, 4) from public.phone_numbers where status = 'active';
  get diagnostics c = row_count;
  n := n + c;
  insert into public.ai_spend (owner_id, feature, ref_id, usd)
  select owner_id, 'linked_account', id, round(5.5 / 30, 4) from public.channel_accounts where status <> 'disconnected';
  get diagnostics c = row_count;
  return n + c;
end;
$$;
revoke all on function private.accrue_channel_costs() from public, anon, authenticated;

select cron.unschedule('accrue-channel-costs') where exists (select 1 from cron.job where jobname = 'accrue-channel-costs');
select cron.schedule('accrue-channel-costs', '15 0 * * *', $$select private.accrue_channel_costs()$$);

-- Admin console: the outreach channels, staff only (null for anyone else).
create or replace function public.admin_channels()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff(auth.uid()) then return null; end if;
  return jsonb_build_object(
    'totals', jsonb_build_object(
      'linkedin', (select count(*) from public.channel_accounts where provider = 'linkedin' and status = 'ok'),
      'whatsapp', (select count(*) from public.channel_accounts where provider = 'whatsapp' and status = 'ok'),
      'needs_reconnect', (select count(*) from public.channel_accounts where status in ('credentials', 'error')),
      'numbers', (select count(*) from public.phone_numbers where status = 'active'),
      'calls_7d', (select count(*) from public.calls where started_at > now() - interval '7 days'),
      'answered_7d', (select count(*) from public.calls where started_at > now() - interval '7 days' and status = 'completed'),
      'messages_7d', (select count(*) from public.channel_messages where direction = 'outbound' and sent_at > now() - interval '7 days'),
      'domains_pending', (select count(*) from public.sending_domains where bought_by_centrale and status not in ('verified', 'removed')),
      'channel_cost_30d', (select coalesce(round(sum(usd)::numeric, 2), 0) from public.ai_spend
        where feature in ('phone_number', 'phone_number_daily', 'call_minutes', 'linked_account', 'domain_purchase') and created_at > now() - interval '30 days')
    ),
    'founders', coalesce((
      select jsonb_agg(row_to_json(x) order by x.calls_7d desc, x.email)
      from (
        select p.email,
          (select a.status from public.channel_accounts a where a.owner_id = p.id and a.provider = 'linkedin' and a.status <> 'disconnected' limit 1) as linkedin,
          (select a.status from public.channel_accounts a where a.owner_id = p.id and a.provider = 'whatsapp' and a.status <> 'disconnected' limit 1) as whatsapp,
          (select n.e164 from public.phone_numbers n where n.owner_id = p.id and n.status = 'active' limit 1) as number,
          (select count(*) from public.calls c where c.owner_id = p.id and c.started_at > now() - interval '7 days') as calls_7d,
          (select d.domain || ' (' || d.status || ')' from public.sending_domains d where d.owner_id = p.id and d.bought_by_centrale and d.status <> 'removed' limit 1) as bought_domain
        from public.profiles p
        where exists (select 1 from public.channel_accounts a where a.owner_id = p.id and a.status <> 'disconnected')
           or exists (select 1 from public.phone_numbers n where n.owner_id = p.id and n.status = 'active')
           or exists (select 1 from public.sending_domains d where d.owner_id = p.id and d.bought_by_centrale)
        limit 200
      ) x
    ), '[]')
  );
end;
$$;
revoke all on function public.admin_channels() from public, anon;
grant execute on function public.admin_channels() to authenticated;
