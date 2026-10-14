# Centrale: build status

What is live, what is built but not shipped, what is waiting on someone, and what was left out on purpose.
Keep this in step with the PRD (claude.ai/code/artifact/aca85a1b-767a-48ff-a275-aaa8ac14f6cc) and update it with every PR.

Last updated: 2026-10-14

## Live on www.centralegtm.com

- Signup, onboarding (website scrape, profile, brand, inbox, Claude picks), pitch deck, investor directory (335k, 31 filters, AI search, saved searches), drafts, Outbox, follow-ups, inbox and replies, custom domains.
- Test mode: every outreach email goes to oliverburt3@gmail.com (`OUTREACH_LIVE` off).
- Email the top 10, 25 or 50 of a search.
- CI on every push: types, lint and build for the app; type check and tests for edge functions.

## Built, not shipped yet

Blocked because the Supabase connection in Claude's session only sees the "Decibels" project. Reconnect it to Centrale (`tldvqiqucfmlnkgxaufy`), then apply migrations and deploy functions in PR order. Each PR lists its exact steps.

| PR | Branch | Contents | State |
|---|---|---|---|
| #1 | `prd/phase-0-db` | Tester plan (no reveals or exports), unsubscribe link and do-not-email list, bounce handling, CORS locked to our sites, hourly health check emails | Draft, CI green, not applied |
| #2 | `prd/phase-1` | Investor self-removal at /remove, founder account deletion, account-wide daily send cap, raise pipeline | Draft, stacked on #1, not applied |
| #3 | `prd/phase-2` | Signup abuse limits, staff admin console (/dashboard/admin), outreach analytics, booking link with click tracking | Draft, stacked on #2, not applied |

## Partly done

- **Health check alerts.** Covers sends, decks, cron jobs, spend, database size and the send cap. Does not cover the Whop or OpenMail webhooks failing silently (they log but nothing counts their failures yet).
- **Investor removal.** Hides the investor everywhere and suppresses the address. The source row in `investors_achraf` is kept; full erasure on request is a manual staff step. A future directory rebuild must skip `private.investor_removals`.
- **Compliance footer.** Unsubscribe link is in. The postal address only appears once `COMPANY_POSTAL_ADDRESS` is set in Vault.
- **Search speed.** Default view is narrowed to the founder's profile so it loads, but wide searches stay slow until the database upgrade, then the 4 dropped search indexes need rebuilding and the keep-warm job turning back on.
- **Booking link.** Drafts offer it and clicks are counted, but a booked meeting does not move the investor to Meeting. That needs Calendly or Cal.com webhooks, which means a provider account per founder or an OAuth app.
- **Outreach analytics.** Rates by sector, stage, region and role. Not by email version yet, since drafts are not tagged with a version or template.
- **Signup limits.** Per network and throwaway domains. Does not stop someone using many real Gmail addresses from different networks; Whop's card check is the backstop.
- **Admin console.** Read only. No actions yet (change a plan, pause an inbox, add a suppression by hand); those are done in Supabase for now.
- **Daily send cap.** Defaults to 150 (OpenMail Pro, first 30 days). Raise `OPENMAIL_ACCOUNT_DAILY_CAP` in Vault to 500 once the account is past 30 days.

## Needs Achraf

- [ ] Upgrade Supabase to Pro plus Small compute (about $40 a month). Database is over the free limit and has gone read-only once.
- [ ] Confirm the $149 price, set it in Whop and the `plans` table. Annual plan or not.
- [ ] Confirm the rights to use and resell each investor data source; name who answers removal requests.
- [ ] Legal review of live cold sending (UK PECR, GDPR, CAN-SPAM), then pick the date to turn on `OUTREACH_LIVE`.
- [ ] Terms of service, privacy policy, data processing agreement, cookie notice (text from a lawyer; Claude can build the pages).
- [ ] Company postal address for the email footer (`COMPANY_POSTAL_ADDRESS`).
- [ ] Who handles support and where founders reach us (then Claude builds the help form to that address).
- [ ] OpenMail Enterprise: ask now or at about 20 active founders.
- [ ] Choose the first 5 to 10 founders for the controlled launch.
- [ ] Decide which comes first: LinkedIn outreach or email finding.

## Needs Oliver

- [ ] Reconnect the Supabase connector to Centrale's project so Claude can apply and deploy PRs #1 to #3.
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

1. Investor import command (load a batch, rebuild search tables and facets, skip removed investors)
2. End-to-end test of the founder flow with Claude and Firecrawl calls faked
3. Admin console actions (change plan, pause inbox, suppress an address)
4. Count Whop and OpenMail webhook failures in the health check
