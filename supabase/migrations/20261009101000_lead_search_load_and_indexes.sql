-- Load the slim search tables from investors_achraf and index them. Applied in pieces because each
-- migration run has a two-minute limit; re-run the same steps after every import.

select private.refresh_lead_keywords();
select private.refresh_lead_search_range(0, 60000);
select private.refresh_lead_search_range(60001, 150000);
select private.refresh_lead_search_range(150001, 240000);
select private.refresh_lead_search_range(240001, 400000);

set maintenance_work_mem = '256MB';
-- Enums and ranges
create index if not exists lead_search_country on private.lead_search (country);
create index if not exists lead_search_region on private.lead_search (region);
create index if not exists lead_search_industry on private.lead_search (industry);
create index if not exists lead_search_size on private.lead_search (size);
create index if not exists lead_search_role on private.lead_search (role);
create index if not exists lead_search_founded on private.lead_search (founded);
create index if not exists lead_search_firm_key on private.lead_search (firm_key);
create index if not exists lead_search_name_sort on private.lead_search (full_name, id);
create index if not exists lead_search_firm_sort on private.lead_search (firm, id);
-- Flags, on the rarer sides
create index if not exists lead_search_phone on private.lead_search (id) where has_phone;
create index if not exists lead_search_email on private.lead_search (id) where has_email;
create index if not exists lead_search_no_email on private.lead_search (id) where not has_email;
-- Arrays
create index if not exists lead_search_stages on private.lead_search using gin (stages);
create index if not exists lead_search_focus on private.lead_search using gin (focus);
create index if not exists lead_search_kw on private.lead_search using gin (kw extensions.gin__int_ops);
-- "Contains" text: trigram
create index if not exists lead_search_qtext_trgm on private.lead_search using gin (qtext extensions.gin_trgm_ops);
create index if not exists lead_search_title_trgm on private.lead_search using gin (title extensions.gin_trgm_ops);
create index if not exists lead_search_name_trgm on private.lead_search using gin (full_name extensions.gin_trgm_ops);
create index if not exists lead_search_firm_trgm on private.lead_search using gin (firm extensions.gin_trgm_ops);
create index if not exists lead_search_city_trgm on private.lead_search using gin (city extensions.gin_trgm_ops);
create index if not exists lead_text_specialties_trgm on private.lead_text using gin (specialties extensions.gin_trgm_ops);
create index if not exists lead_text_headline_trgm on private.lead_text using gin (headline extensions.gin_trgm_ops);
-- The description index takes longer than a migration may run, so it was built by a one-off pg_cron job:
-- create index if not exists lead_text_about_trgm on private.lead_text using gin (about extensions.gin_trgm_ops);

select private.refresh_lead_facets();
