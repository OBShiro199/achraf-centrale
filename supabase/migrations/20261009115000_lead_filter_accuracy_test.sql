-- Accuracy suite for the directory filters: for each case, the engine's results on a sample must equal the raw
-- predicate on investors_achraf (completeness and soundness), and the count must agree.
-- Run: select * from private.test_lead_filters(1000);  every row should have ok = true.
create or replace function private.test_lead_filters(p_sample integer default 1500)
returns table (name text, expected integer, got integer, missing integer, extra integer, counted integer, ok boolean)
language plpgsql security definer set search_path = '' set jit = 'off'
as $$
declare
  sample bigint[];
  c record;
  want bigint[];
  have bigint[];
  n integer;
begin
  select array_agg(id order by id) into sample from (select id from public.investors_achraf order by md5(id::text) limit p_sample) x;
  for c in select * from (values
    ('focus one', '{"focus":["FinTech"]}', $p$a.focus ? 'FinTech'$p$),
    ('focus two', '{"focus":["FinTech","AI/ML"]}', $p$a.focus ?| array['FinTech','AI/ML']$p$),
    ('focus not', '{"focusNot":["FinTech"]}', $p$not (a.focus ? 'FinTech')$p$),
    ('stage', '{"stages":["Seed"]}', $p$a.stage ? 'Seed'$p$),
    ('stage not', '{"stagesNot":["Buyout/PE"]}', $p$not (a.stage ? 'Buyout/PE')$p$),
    ('country', '{"countries":["United Kingdom"]}', $p$a.country = 'United Kingdom'$p$),
    ('country not', '{"countriesNot":["United States"]}', $p$coalesce(a.country, '') <> 'United States'$p$),
    ('region', '{"regions":["Europe"]}', $p$private.region_of(nullif(trim(a.country), '')) = 'Europe'$p$),
    ('region or city', '{"regions":["UK"],"cities":["new york"]}', $p$private.region_of(nullif(trim(a.country), '')) = 'UK' or a.city ilike '%new york%'$p$),
    ('state', '{"states":["CA"]}', $p$a.state = 'CA'$p$),
    ('title', '{"titles":["partner"]}', $p$a.title ilike '%partner%'$p$),
    ('title two', '{"titles":["partner","principal"]}', $p$a.title ilike '%partner%' or a.title ilike '%principal%'$p$),
    ('title not', '{"titlesNot":["analyst"]}', $p$not (coalesce(a.title, '') ilike '%analyst%')$p$),
    ('title escaped', '{"titles":["50%"]}', $p$a.title ilike '%50\%%'$p$),
    ('name', '{"names":["john"]}', $p$a.full_name ilike '%john%'$p$),
    ('firm', '{"firms":["capital"]}', $p$a.firm ilike '%capital%'$p$),
    ('firm not', '{"firmsNot":["capital"]}', $p$not (coalesce(a.firm, '') ilike '%capital%')$p$),
    ('industry', '{"industries":["Venture Capital and Private Equity Principals"]}', $p$a.firm_industry = 'Venture Capital and Private Equity Principals'$p$),
    ('industry not', '{"industriesNot":["Investment Banking"]}', $p$coalesce(a.firm_industry, '') <> 'Investment Banking'$p$),
    ('size', '{"sizes":["1-10","11-50"]}', $p$private.size_band(a.firm_size) in ('1-10', '11-50')$p$),
    ('founded from', '{"foundedMin":2015}', $p$a.firm_founded >= 2015$p$),
    ('founded range', '{"foundedMin":2010,"foundedMax":2015}', $p$a.firm_founded between 2010 and 2015$p$),
    ('has email', '{"hasEmail":true}', $p$coalesce(a.email, '') <> ''$p$),
    ('no email', '{"hasEmail":false}', $p$coalesce(a.email, '') = ''$p$),
    ('has phone', '{"hasPhone":true}', $p$coalesce(a.phone, '') <> ''$p$),
    ('no linkedin', '{"hasLinkedin":false}', $p$coalesce(a.linkedin_url, '') = ''$p$),
    ('specialty', '{"specialties":["fintech"]}', $p$a.specialties ilike '%fintech%'$p$),
    ('about', '{"about":["seed"]}', $p$a.firm_about ilike '%seed%'$p$),
    ('quick search', '{"q":"capital new"}', $p$lower(concat_ws(' ', a.full_name, a.title, a.firm, a.firm_domain, a.city, a.country)) like '%capital%' and lower(concat_ws(' ', a.full_name, a.title, a.firm, a.firm_domain, a.city, a.country)) like '%new%'$p$),
    ('role', '{"roles":["partner","angel"]}', $p$private.lead_role(a.title) in ('partner', 'angel')$p$),
    ('stacked', '{"focus":["HealthTech"],"stages":["Early Stage","Seed"],"hasEmail":true,"regions":["US"]}',
      $p$a.focus ? 'HealthTech' and a.stage ?| array['Early Stage','Seed'] and coalesce(a.email, '') <> '' and private.region_of(nullif(trim(a.country), '')) = 'US'$p$),
    ('stacked text', '{"titles":["managing"],"specialties":["health"],"countriesNot":["United States"]}',
      $p$a.title ilike '%managing%' and a.specialties ilike '%health%' and coalesce(a.country, '') <> 'United States'$p$)
  ) v(name, filters, pred) loop
    execute 'select coalesce(array_agg(a.id order by a.id), ''{}'') from public.investors_achraf a where a.id = any ($1) and (' || c.pred || ')'
      into want using sample;
    select coalesce(array_agg(p.id order by p.id), '{}') into have
    from private.lead_page(private.lead_query_from(c.filters::jsonb || jsonb_build_object('ids', to_jsonb(sample)), null), 'name', 'asc', 1000, 0) p;
    n := private.lead_count(private.lead_query_from(c.filters::jsonb || jsonb_build_object('ids', to_jsonb(sample)), null));
    name := c.name;
    expected := cardinality(want);
    got := cardinality(have);
    missing := (select count(*) from unnest(want) w where not (w = any (have)));
    extra := (select count(*) from unnest(have) h where not (h = any (want)));
    counted := n;
    ok := missing = 0 and extra = 0 and n = expected;
    return next;
  end loop;
end;
$$;
revoke all on function private.test_lead_filters(integer) from public, anon, authenticated;
