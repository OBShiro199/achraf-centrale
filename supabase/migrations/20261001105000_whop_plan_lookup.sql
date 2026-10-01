-- One-off, read-only request to Whop for the plan's details (price, trial, company); the response
-- landed in net._http_response. Kept so the remote migration history matches the repo.
select net.http_get(
  url := 'https://api.whop.com/api/v1/plans/plan_EtTE02V8ronH4',
  headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'WHOP_API_KEY'))
);
