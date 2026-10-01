-- One-off, read-only check that the plan's 7-day trial is saved in Whop. Kept so the remote migration
-- history matches the repo.
select net.http_get(
  url := 'https://api.whop.com/api/v1/plans/plan_EtTE02V8ronH4',
  headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'WHOP_API_KEY'))
);
