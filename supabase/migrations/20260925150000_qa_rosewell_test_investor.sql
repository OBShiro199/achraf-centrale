-- QA only: an investor whose email is the Rosewell founder inbox, so a send from one
-- founder can be replied to from another founder's inbox. Delete before launch.
insert into public.investors
  (full_name, title, firm, email, phone, location, investor_type, stages, sectors,
   check_min_usd, check_max_usd, fund_size_usd, portfolio, thesis, "values",
   focus_note, leads_rounds, min_revenue_band, website_url)
values
  ('Rosa Wells', 'QA test investor', 'Centrale Test Desk', 'oliver-rosewell@omail.sh', '+44 7700 900111',
   'London, UK', 'angel', '{pre_seed,seed}', '{b2b_saas,consumer,devtools,edtech}',
   25000, 250000, null, '{"Test Co One","Test Co Two"}',
   'Test investor for internal QA. Emails land in the Rosewell founder inbox so replies can be tested end to end.',
   '{}', 'Internal testing only, not a real investor', true, null, null);
