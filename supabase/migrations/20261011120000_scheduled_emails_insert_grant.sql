-- The investor_id rename carried the founder insert grant to legacy_investor_id; queueing uses investor_id.
grant insert (investor_id) on public.scheduled_emails to authenticated;
revoke insert (legacy_investor_id) on public.scheduled_emails from authenticated;
