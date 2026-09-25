-- Ten fictional investors for testing. Every email routes to the test Gmail
-- (plus-addressed) and every phone number is in a reserved fictional range.

insert into public.investors
  (full_name, title, firm, email, phone, location, investor_type, stages, sectors,
   check_min_usd, check_max_usd, fund_size_usd, portfolio, thesis, "values",
   focus_note, leads_rounds, min_revenue_band, website_url)
values
  ('John Evans', 'Partner', 'Northgate Ventures', 'oliverburt3+1@gmail.com', '+44 7700 900101',
   'London, UK', 'vc', '{pre_seed,seed}', '{b2b_saas,gtm_sales,ai_ml}',
   150000, 500000, 85000000, '{Pipewise,Callboard,Quotely,Stackrank}',
   'Backs B2B software that shortens the sales cycle. Prefers founders who have carried a quota.',
   '{}', 'Only GTM and revenue tools', true, null, 'https://northgate.example'),

  ('Steve Jones', 'Angel investor', 'Independent', 'oliverburt3+2@gmail.com', '+44 7700 900202',
   'Manchester, UK', 'angel', '{pre_seed,angel}', '{ecommerce,consumer,hardware}',
   10000, 50000, null, '{"Kettle & Crumb",Loopbottle,Trailpack}',
   'Sold his own DTC brand in 2021. Writes small cheques into physical product brands with early sales.',
   '{local_community}', 'Physical products with repeat purchase', false, '0_10k', null),

  ('Louise Phillips', 'Principal', 'Leafline Climate Fund', 'oliverburt3+3@gmail.com', '+44 7700 900303',
   'Edinburgh, UK', 'vc', '{seed,series_a}', '{climate,hardware,food_agri,logistics}',
   500000, 2000000, 120000000, '{Heatloop,Tidegrid,Soilsense,"Crate Zero"}',
   'Decarbonisation with measurable tonnes avoided. Hardware is welcome if the unit economics hold.',
   '{eco_friendly,b_corp}', 'Wants a carbon impact estimate in the deck', true, '11_20k', 'https://leafline.example'),

  ('Bill Chutney', 'Managing Partner', 'Chutney & Co. Family Office', 'oliverburt3+4@gmail.com', '+1 555 0104',
   'New York, US', 'family_office', '{seed,series_a,series_b}', '{fintech,proptech,consumer}',
   250000, 1500000, 300000000, '{Ledgerline,Keyhold,"Tabby Rent"}',
   'Patient capital on a 7 to 10 year horizon. Likes quiet, cash generative businesses.',
   '{}', 'Prefers profitable or close to profitable companies', false, '31_50k', null),

  ('Priya Raman', 'Partner', 'Brightwater Partners', 'oliverburt3+5@gmail.com', '+1 555 0105',
   'San Francisco, US', 'vc', '{pre_seed,seed}', '{ai_ml,devtools,b2b_saas}',
   250000, 1000000, 150000000, '{Tracewell,"Promptly Labs","Kernel Nine","Shipyard CI"}',
   'Technical founders building infrastructure for AI teams.',
   '{ethical_ai,open_source}', 'Open source with a commercial path', true, null, 'https://brightwater.example'),

  ('Marcus Okafor', 'Founder', 'Pilot Light Accelerator', 'oliverburt3+6@gmail.com', '+44 7700 900606',
   'London, UK', 'accelerator', '{pre_seed}', '{fintech,edtech,marketplace,health}',
   50000, 125000, 20000000, '{Paylane,Tutorly,Clinicly,Farmgate}',
   'Twelve week programme for first time founders. Standard deal is $100k for 7%.',
   '{diversity,social_impact,education}', 'First time founders welcome', true, 'pre_revenue', 'https://pilotlight.example'),

  ('Hannah Lindqvist', 'Investment Director', 'Aster Impact Capital', 'oliverburt3+7@gmail.com', '+44 7700 900707',
   'Stockholm, SE', 'vc', '{seed,series_a}', '{health,edtech,climate,consumer}',
   500000, 3000000, 200000000, '{Mindnest,Openclass,"Refill Row",Brightbirth}',
   'Impact first. Every portfolio company reports on social outcomes each quarter.',
   '{social_impact,charity,b_corp,health_wellbeing}', 'Considers non-profit adjacent models', true, '11_20k', 'https://aster.example'),

  ('Tom Beaumont', 'Angel investor', 'Independent', 'oliverburt3+8@gmail.com', '+44 7700 900808',
   'Bristol, UK', 'angel', '{angel,pre_seed,seed}', '{gtm_sales,b2b_saas,marketplace}',
   25000, 100000, null, '{Leadloom,"Cadence Desk",Brokerly}',
   'Former VP Sales. Helps with first sales hires and pricing.',
   '{}', 'Only CRM and sales tools', false, '0_10k', null),

  ('Sofia Marchetti', 'Head of Ventures', 'Fornace Corporate Ventures', 'oliverburt3+9@gmail.com', '+44 7700 900909',
   'Milan, IT', 'cvc', '{series_a,series_b}', '{hardware,logistics,food_agri,ecommerce}',
   1000000, 5000000, 250000000, '{Palletpath,"Coldchain One","Vetro Labs"}',
   'Venture arm of a packaging group. Invests where a commercial pilot is possible.',
   '{eco_friendly}', 'Physical product and supply chain only', false, '51_100k', 'https://fornace.example'),

  ('Daniel Kim', 'General Partner', 'Keel Street Capital', 'oliverburt3+10@gmail.com', '+1 555 0110',
   'Austin, US', 'vc', '{pre_seed,seed,series_a}', '{fintech,ai_ml,gtm_sales,b2b_saas}',
   300000, 2000000, 110000000, '{"Settle Stack",Clausewise,"Pipeline Pilot"}',
   'Vertical software and fintech for industries that software has ignored.',
   '{diversity}', 'Remote first teams', true, '0_10k', 'https://keelstreet.example');
