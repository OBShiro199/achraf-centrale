-- One-off permission check for the Whop key: list memberships, and create one unused checkout
-- configuration. Kept so the remote migration history matches the repo.
select net.http_get(
  url := 'https://api.whop.com/api/v1/memberships?company_id=biz_Y25A4wLf68IAcI&first=1',
  headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'WHOP_API_KEY'))
);
select net.http_post(
  url := 'https://api.whop.com/api/v1/checkout_configurations',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'WHOP_API_KEY'),
    'Content-Type', 'application/json'
  ),
  body := jsonb_build_object('mode', 'payment', 'plan_id', 'plan_EtTE02V8ronH4', 'redirect_url', 'https://www.centralegtm.com/start?checkout=done', 'metadata', jsonb_build_object('purpose', 'permission check'))
);
