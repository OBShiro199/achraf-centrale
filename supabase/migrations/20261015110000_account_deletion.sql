-- Founder account deletion (PRD: founder data). The delete-account function removes OpenMail inboxes and
-- domains and the founder's files, calls this for rows with no foreign key to auth.users, then deletes the
-- auth user, which cascades to every founder table. ai_spend keeps its rows with owner_id set to null, and
-- the do-not-email list keeps its entries, since both describe investors and costs rather than the founder.

create or replace function public.forget_owner(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.inbox_webhook_secrets s
    using public.inboxes i where i.owner_id = p_uid and s.openmail_inbox_id = i.openmail_inbox_id;
  delete from private.rate_limits where owner_id = p_uid;
  delete from private.search_usage where owner_id = p_uid;
end;
$$;
revoke all on function public.forget_owner(uuid) from public, anon, authenticated;
grant execute on function public.forget_owner(uuid) to service_role;
