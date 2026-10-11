-- Removes the old investor directory (public.investors, public.contacts) and everything that only served it.
-- Run by hand in the SQL editor on 2026-10-10; the app reads only public.investors_achraf now.
-- History rows in saved_investors, outreach_messages and the rest keep their legacy_investor_id values.

begin;

drop function if exists private.sync_investors_step();
drop function if exists private.sync_investors_from_contacts(integer);
drop function if exists private.finish_investor_sync();
drop function if exists private.search_page(jsonb, text, text, integer, integer, uuid, boolean);
drop function if exists private.investor_directory(jsonb, uuid);

alter table public.saved_investors   drop constraint if exists saved_investors_investor_id_fkey;
alter table public.outreach_messages drop constraint if exists outreach_messages_investor_id_fkey;
alter table public.scheduled_emails  drop constraint if exists scheduled_emails_investor_id_fkey;
alter table public.investor_matches  drop constraint if exists investor_matches_investor_id_fkey;
alter table public.investor_unlocks  drop constraint if exists investor_unlocks_investor_id_fkey;

drop table if exists private.investor_index;
drop function if exists private.investor_index_tg();
drop table if exists private.keyword_ids;
drop table if exists public.investor_keywords;

drop table if exists public.investors;
drop table if exists public.contacts;

commit;
