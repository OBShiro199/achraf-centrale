# Centrale: build status

What is live, what is built but not shipped, what is waiting on someone, and what was left out on purpose.
Keep this in step with the PRD (claude.ai/code/artifact/aca85a1b-767a-48ff-a275-aaa8ac14f6cc) and update it with every PR.

Last updated: 2026-10-14

## Live on www.centralegtm.com

- Signup, onboarding (website scrape, profile, brand, inbox, Claude picks), pitch deck, investor directory (133,773 investors, all with an email; 31 filters, AI search, saved searches), drafts, Outbox, follow-ups, inbox and replies, custom domains.
- Test mode: every outreach email goes to oliverburt3@gmail.com (`OUTREACH_LIVE` off).
- Email the top 10, 25 or 50 of a search.
- CI on every push: types, lint and build for the app; type check and tests for edge functions.

## Shipped 2026-10-14

All 12 migrations (20261014100000 to 20261017120000) applied to `tldvqiqucfmlnkgxaufy` and recorded in the migration history; all 23 edge functions deployed with their login settings; merged to main in #1 and #5 (#5 replaced the stacked #2 to #4).

- Tester plan without reveals or exports; unsubscribe link, do-not-email list, bounce handling; CORS locked to our sites; hourly health check emails.
- Investor self-removal at /remove; founder account deletion; account-wide daily send cap; raise pipeline.
- Signup limits; staff admin console with actions; outreach analytics; booking link with click tracking.
- Investor import command; end-to-end tests; edge function and webhook failure alerts.

How to ship from now on: the Supabase CLI on Oliver's Mac is logged in to the account that owns Centrale. Apply migrations with `supabase db query --linked --project-ref tldvqiqucfmlnkgxaufy -f <file>` (wrapped in a transaction, plus a row in `supabase_migrations.schema_migrations`) and deploy with `supabase functions deploy <name> --project-ref tldvqiqucfmlnkgxaufy`, adding `--no-verify-jwt` for track-open, signup, openmail-webhook, generate-deck, process-outbox, stripe-webhook, whop-webhook, unsubscribe, investor-removal, meeting-link and ops-alerts. Merge stacked PRs one at a time without deleting a base branch that another PR still points at.

## Partly done

- **Investor directory size.** On 9 or 10 October (around the database lock fix) the 201,313 investors without an email were deleted from `investors_achraf`, leaving 133,773. On 14 October the search tables were brought in line and the filter counts refreshed. To bring LinkedIn-only investors back, reload them from the source file with `npm run import-investors` after the Supabase upgrade. The filter accuracy suite needs a sample under 1,000 now that every row has an email: `select * from private.test_lead_filters(900);` (32 of 32 pass).
- **Health check alerts.** Covers sends, decks, cron jobs, spend, database size, the send cap, and edge function failures (any webhook failure, or 3 failures an hour elsewhere). Does not notice a webhook that stops arriving at all.
- **Investor removal.** Hides the investor everywhere and suppresses the address. The source row in `investors_achraf` is kept; full erasure on request is a manual staff step. A future directory rebuild must skip `private.investor_removals`.
- **Compliance footer.** Unsubscribe link is in. The postal address only appears once `COMPANY_POSTAL_ADDRESS` is set in Vault.
- **Search speed.** Default view is narrowed to the founder's profile so it loads, but wide searches stay slow until the database upgrade, then the 4 dropped search indexes need rebuilding and the keep-warm job turning back on.
- **Booking link.** Drafts offer it and clicks are counted, but a booked meeting does not move the investor to Meeting. That needs Calendly or Cal.com webhooks, which means a provider account per founder or an OAuth app.
- **Outreach analytics.** Rates by sector, stage, region and role. Not by email version yet, since drafts are not tagged with a version or template.
- **Signup limits.** Per network and throwaway domains. Does not stop someone using many real Gmail addresses from different networks; Whop's card check is the backstop.
- **Admin console.** Actions cover plan, inbox pause and manual address blocks. A manual plan change is overwritten by Whop's next webhook for that founder. No refunds, impersonation or deck re-runs.
- **End-to-end tests.** Public pages run on every PR. The founder flow only runs once `E2E_EMAIL` and `E2E_PASSWORD` repository secrets exist for one fixed tester account that has finished onboarding (see `e2e/README.md`). Onboarding and deck generation are not covered, since both spend money.
- **Investor import.** `npm run import-investors -- file.csv` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set. Adds new investors only; it does not update existing rows. New specialties are not added to keyword search until a full keyword rebuild (`select private.refresh_lead_keywords();` then every range, as in `20261009101000_lead_search_load_and_indexes.sql`).
- **Daily send cap.** Defaults to 150 (OpenMail Pro, first 30 days). Raise `OPENMAIL_ACCOUNT_DAILY_CAP` in Vault to 500 once the account is past 30 days.

## Needs Achraf

- [ ] Upgrade Supabase to Pro plus Small compute (about $40 a month). Database is over the free limit and has gone read-only once.
- [ ] Confirm the $149 price, set it in Whop and the `plans` table. Annual plan or not.
- [ ] Confirm the rights to use and resell each investor data source; name who answers removal requests.
- [ ] Legal review of live cold sending (UK PECR, GDPR, CAN-SPAM), then pick the date to turn on `OUTREACH_LIVE`.
- [ ] Lawyer review of the drafted /terms and /privacy pages (live, marked as awaiting legal review), plus a data processing agreement for founders. No cookie banner is needed while the site only uses sign-in cookies.
- [ ] Company postal address for the email footer (`COMPANY_POSTAL_ADDRESS`).
- [ ] Who handles support and where founders reach us (then Claude builds the help form to that address).
- [ ] OpenMail Enterprise: ask now or at about 20 active founders.
- [ ] Choose the first 5 to 10 founders for the controlled launch.
- [ ] Decide which comes first: LinkedIn outreach or email finding.

## Needs Oliver

- [ ] Rotate the OpenMail, Whop and Dynadot keys that were shared in chat; store new ones only in Vault.
- [ ] Custom SMTP for login emails (Resend or Postmark free tier) and set Supabase Auth Site URL and redirect URLs to www.centralegtm.com.
- [ ] Run the old directory clean-up (`supabase/migrations/20261010100000_drop_old_directory.sql`) by hand.
- [ ] A database connection secret in GitHub, if we want the migration drift check in CI.

## Left out on purpose

| Item | Why |
|---|---|
| Sentry error tracking | Needs an account |
| Staging Supabase project | Costs a second project |
| Email finding | Paid provider, per-lookup cost |
| LinkedIn outreach (Unipile) | Paid provider, and a decision on order |
| Domain purchase in app (Dynadot) | Spends money per founder |
| Richer investor data (portfolio, deals, cheques) | Paid data partner |
| Per-inbox warm-up ramp above 20 a day | OpenMail sets its own per-inbox limits; raising ours blind would make sends fail |
| Support form | Destination is Achraf's decision |
| Migration drift check in CI | Needs a database secret in GitHub |
| Team seats | Changes billing and data ownership; wants a product decision |
| CSV import of own contacts, deck view tracking | Store a lot of rows; wait for the database upgrade |

## Next up, no sign-off needed

1. Alert when the Whop or OpenMail webhooks go quiet for too long while there is activity
2. Admin console: per-founder detail page (timeline of sends, replies, deck runs, spend)
3. Update existing investors in the import command (match on email, refresh changed fields)
4. Accessibility pass on the dashboard (keyboard focus, labels, contrast)
