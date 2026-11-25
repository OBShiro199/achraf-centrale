# Centrale handover

Everything someone new needs to run, change and ship Centrale: a developer, Achraf, or an AI coding agent (Claude Code, Grok). Read this first, then `CLAUDE.md` (house rules), `README.md` (architecture) and `docs/STATUS.md` (what is done and what is waiting).

No secrets live in this repo. This file names every account and secret and says where it is kept.

## 1. What Centrale is

An investor outreach workspace for founders raising pre-seed to Series A, at https://www.centralegtm.com.

1. A founder signs up and starts a 7-day trial with a card through Whop. They choose $129 a month or $249 every three months.
2. In onboarding, Claude writes their startup profile from their website. Centrale matches them with 10 investors at their round, creates their email inbox, buys them a US phone number, and offers to buy a sending domain and connect LinkedIn and WhatsApp.
3. They reach investors by email (OpenMail), LinkedIn and WhatsApp (Unipile, from their own accounts) and phone (Telnyx, in the browser). Claude drafts every message, and the founder reads it before it sends.
4. Every reply and call lands in one Inbox (the "Unibox"). Claude tags each conversation interested, meeting, call back, not now or not interested, and the pipeline moves itself.

## 2. Accounts and who owns them

| Service | What it does | Login owner | Notes |
|---|---|---|---|
| GitHub `OBShiro199/achraf-centrale` | Code | Oliver | Add collaborators in repo settings |
| Vercel (team `rosewell`, project `achraf-centrale`) | Hosts the website, builds every push | Oliver | Production deploys from `main` |
| Supabase project `tldvqiqucfmlnkgxaufy` ("Achraf SaaS", eu-central-1) | Database, auth, storage, edge functions, cron, Vault | Oliver (separate Supabase account from his other projects) | Needs the Pro plan for size |
| OpenMail (console.openmail.sh) | Founder inboxes and sending | Achraf | Pro plan; account cold cap 150/day, then 500 |
| Unipile (dashboard.unipile.com) | LinkedIn and WhatsApp connections | Achraf (to create) | About €5 per connected account per month, minimum €49 |
| Telnyx (portal.telnyx.com) | US numbers, calls, recording, transcription | Achraf | Account needs Level 2 verification to buy US numbers from a non-US account |
| Porkbun (porkbun.com) | Buys founders' sending domains | Achraf (to create) | Prepaid credit; turn on auto top-up |
| Whop | Checkout and subscriptions | Achraf | Two plans to create: monthly $129, quarterly $249, both with a 7-day trial |
| Anthropic console | Claude API | Oliver | Key in Vault |
| Firecrawl | Reads founders' websites | Oliver | Key in Vault |
| Resend (optional) | Login and password emails via Supabase Auth SMTP | Oliver | Not yet connected |
| Domain `centralegtm.com` | Website domain | Achraf | DNS points at Vercel |

Rotate any key that has ever been pasted into a chat.

## 3. Secrets (Supabase Vault)

Edge functions read secrets from Supabase Vault through `get_app_secret()` (see `supabase/functions/_shared/core.ts`). Add or change one in Supabase Dashboard > Project settings > Vault, or with SQL: `select vault.create_secret('<value>', '<NAME>');` (`vault.update_secret(id, '<value>')` to change it).

| Name | Used for |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (profiles, drafts, decks, outcome tags) |
| `FIRECRAWL_API_KEY` | Website scraping |
| `OPENMAIL_API_KEY`, `OPENMAIL_SYSTEM_INBOX_ID` | Founder inboxes; the system inbox that emails founders and staff |
| `OPENMAIL_ACCOUNT_DAILY_CAP` | Account-wide cold email cap (default 150; set 500 after 30 days on Pro) |
| `OUTREACH_LIVE` | `true` sends to real investors. Anything else sends every email to `OUTREACH_TEST_RECIPIENT` |
| `OUTREACH_TEST_RECIPIENT` | Where test-mode email goes (default oliverburt3@gmail.com) |
| `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET` | Billing |
| `UNIPILE_DSN`, `UNIPILE_API_KEY`, `UNIPILE_WEBHOOK_SECRET` | LinkedIn and WhatsApp |
| `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID`, `TELNYX_PUBLIC_KEY` | Calling |
| `PORKBUN_API_KEY`, `PORKBUN_SECRET_KEY` | Buying sending domains |
| `DOMAIN_MAX_USD` | Most Centrale pays for a founder's domain (default 13) |
| `APP_URL` | https://www.centralegtm.com |
| `CRON_SECRET` | Lets pg_cron call `process-outbox` and `ops-alerts` |
| `OPS_ALERT_EMAIL`, `OPS_DB_LIMIT_MB` | Hourly health check |
| `COMPANY_POSTAL_ADDRESS` | Optional email footer address (decided 4 Nov 2026 not to set) |

The website itself only needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL`, set in Vercel and in `.env.local` locally.

## 4. Run it on your laptop

You need Node 22+, Deno 2, the Supabase CLI and the GitHub CLI.

```bash
git clone https://github.com/OBShiro199/achraf-centrale.git
cd achraf-centrale
npm install
cp .env.example .env.local   # fill in the three NEXT_PUBLIC_ values from Supabase > Project settings > API
npm run dev                  # http://localhost:3000, talking to the production Supabase project
```

There is no staging database: local runs use production data and production edge functions. Test with a tester account, never a real founder's.

To change the database or edge functions:

```bash
supabase login               # as the account that owns tldvqiqucfmlnkgxaufy
supabase link --project-ref tldvqiqucfmlnkgxaufy
```

## 5. Ship a change

1. Branch from `main`, change code, and update `src/content/docs.tsx` (the matching docs section, a "What's new" line and `DOCS_UPDATED`) whenever behaviour, limits, pricing or copy users rely on changes.
2. Checks (CI runs these on every push):
   ```bash
   npx tsc --noEmit && npx eslint src
   cd supabase/functions && deno check */index.ts && deno test --allow-env --allow-read _shared/
   ```
3. Database change: add `supabase/migrations/<timestamp>_<name>.sql`, then apply it and record it:
   ```bash
   (echo "begin;"; cat supabase/migrations/<file>.sql; echo "insert into supabase_migrations.schema_migrations (version, name) values ('<timestamp>', '<name>');"; echo "commit;") > /tmp/apply.sql
   supabase db query --linked --project-ref tldvqiqucfmlnkgxaufy -f /tmp/apply.sql
   ```
4. Edge function: `supabase functions deploy <name> --project-ref tldvqiqucfmlnkgxaufy`, adding `--no-verify-jwt` for functions that third parties or cron call: `signup`, `track-open`, `openmail-webhook`, `unipile-webhook`, `telnyx-webhook`, `whop-webhook`, `stripe-webhook`, `generate-deck`, `process-outbox`, `ops-alerts`, `unsubscribe`, `investor-removal`, `meeting-link`.
5. Open a pull request. Vercel builds a preview; merging to `main` deploys the website.

## 6. Switching on the new channels (phase 2)

Built and type-checked, but not yet run against the live providers. Do these in order.

1. **Apply migrations** `20261121100000_two_plans_full_trial` and `20261121110000_channels_unibox`, then deploy: `channels`, `phone`, `unipile-webhook` (no JWT), `telnyx-webhook` (no JWT), `domains`, `draft-email`, `send-email`, `process-outbox`, `openmail-webhook`, `inbox`, `whop`, `whop-webhook`, `delete-account`.
2. **Whop, before step 1 goes out:** create two plans on the Centrale product, monthly $129 and quarterly $249 (billed every 3 months), each with a 7-day free trial. The plans migration clears the old monthly plan id (it pointed at the $1 test plan), so straight after applying it run `update public.plans set whop_plan_id = 'plan_...' where id = 'monthly';` and the same for `quarterly`. A plan without an id is hidden from signup and Billing; with neither set, signup cannot start a trial.
3. **Unipile:** create the account, copy the DSN and an API key, pick a random `UNIPILE_WEBHOOK_SECRET`, store all three in Vault, then run `node scripts/setup-integrations.mjs` with them in the environment to register the webhooks.
4. **Telnyx:** complete Level 2 verification, store `TELNYX_API_KEY`, run `scripts/setup-integrations.mjs` with `TELNYX_API_KEY` set (it creates the outbound voice profile and the credential connection), then store the printed `TELNYX_CONNECTION_ID` and your account's `TELNYX_PUBLIC_KEY` in Vault.
5. **Porkbun:** create the account, verify email and phone, add credit and auto top-up, raise the monthly API spend limit above the default $100, create an API key with purchase permission, and store `PORKBUN_API_KEY` and `PORKBUN_SECRET_KEY`.
6. **Test with a tester account:**
   - connect LinkedIn and WhatsApp in Settings > Channels and send yourself a message from an investor profile;
   - get a number and call your own mobile, checking you hear the recording notice and that the recording, transcript and tag appear in Inbox;
   - buy one domain and watch the inbox move onto it.

   The call flow (`telnyx-webhook`) follows Telnyx's documented "parked call" pattern. Three details need the first live call to confirm, in the function logs:
   - which payload field carries the founder's SIP username on `call.initiated` (the code tries `sip_username`, then the `from` address);
   - that `POST /v2/calls` accepts the credential connection's id (if Telnyx asks for a Call Control application id, create one with the same webhook URL and put its id in `TELNYX_CONNECTION_ID`);
   - that the transcription model name `deepgram/nova-3` is accepted.

## 7. Runbook

| Situation | What to do |
|---|---|
| Stop all real sending now | Set `OUTREACH_LIVE` to `false` in Vault. Email goes to the test inbox from the next send. LinkedIn and WhatsApp send from founders' own accounts and are not affected |
| Health alert email | Sent hourly by `ops-alerts` for failed sends, bounces over 3%, cron failures, spend spikes and database size |
| A founder's inbox is suspended | OpenMail stopped it for bounces or complaints. The admin console shows it; reactivation goes through OpenMail support |
| LinkedIn or WhatsApp shows Reconnect | The provider signed the account out. The founder presses Reconnect in Settings > Channels |
| Founder cancels | `whop-webhook` releases their US number and unlinks LinkedIn and WhatsApp |
| Trial limits | The trial has everything, but contact reveals and export credits are capped at 100 (`private.trial_contact_cap()`). Calling or WhatsApp-messaging an investor uses one reveal, once per investor |
| Founder deletes their account | `delete-account` removes their inboxes, domains, number, connected accounts, files and rows |
| Investor asks to be removed | They use /remove, or staff add their address in the admin console |
| Costs | Claude and Firecrawl spend is in `ai_spend` and on Settings > Running costs for staff |

## 8. Working with an AI coding agent

Point the agent at this repo and tell it to read `CLAUDE.md` and this file first. Things it must follow:

- Copy voice: sentence case, no em dashes, no exclamation marks, no emoji, no "unlock", "leverage" or "seamless". Claude prompts share `HOUSE_STYLE`.
- Brand colours are tokens in `src/app/globals.css`; never hard-code a new hex value.
- `src/lib/taxonomy.ts` and `supabase/functions/_shared/taxonomy.ts` change together.
- Every new Claude or Firecrawl call passes `track` so its cost lands in `ai_spend`.
- Next.js here is version 16: read `node_modules/next/dist/docs/` before using an API from memory.
- Never commit keys. Never delete production data without the owner asking.
