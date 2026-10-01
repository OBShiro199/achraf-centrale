# Centrale

Bulk VC applications, one platform. A founder signs up, enters their domain, answers five questions, and gets a startup profile written by Claude, a scored list of investors and a sending inbox, so the first investor email can go out within fifteen minutes of signup.

## Stack

| Layer | What |
| --- | --- |
| Web | Next.js 16 (App Router, `src/proxy.ts` for auth), Tailwind v4, motion, roughjs and rough-notation for the pencil drawings |
| Data | Supabase Postgres with RLS, Storage (`decks` bucket), Realtime (reply notifications) |
| Server | Supabase Edge Functions (Deno) in `supabase/functions` |
| Email | OpenMail: one pod and one inbox per founder, webhooks for inbound mail |
| AI | Claude (`claude-opus-5`) with structured outputs for profiles and email drafts |
| Scraping | Firecrawl v2 single-page scrape |

Supabase project: `tldvqiqucfmlnkgxaufy` (Achraf SaaS, eu-central-1).

## Run it

```bash
npm install
npm run dev
```

`.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL` (see `.env.example`).

## How the pieces fit

1. **Signup** calls the `signup` function, which creates a pre-confirmed user (Supabase's default mailer only delivers to team members, so email confirmation is skipped for now). A trigger creates the `profiles` and `startups` rows.
2. **Onboarding** (`/onboarding`) saves each answer as it goes and starts the Firecrawl scrape the moment the domain is entered. Founders who want a deck answer five questions. The last step runs `build-profile` (Claude) and `provision-inbox` (OpenMail) in parallel, then `match-investors` and, when asked for, `generate-deck`. Every account starts a 7-day free trial.
3. **Dashboard** (`/dashboard`): Home, Investors, Inbox, Outbox, Pitch deck, Startup profile, Settings, Billing. Single sends go through `send-email`; batches and follow-ups are queued in `scheduled_emails` and sent by `process-outbox` every minute. Every email carries an open-tracking pixel served by `track-open`.
4. **Replies** hit `openmail-webhook`, which verifies the HMAC signature with the inbox's secret, dedupes by event id, links the reply to the investor by thread, emails the founder from the system inbox, and the insert fans out to the browser over Realtime (toast plus confetti).

### Edge functions

| Function | JWT | Purpose |
| --- | --- | --- |
| `signup` | off | Create a confirmed account |
| `scrape-site` | on | Firecrawl the homepage, store title, description, favicon, markdown |
| `build-profile` | on | Claude writes one-liner, summary, mission, goal, sectors, keywords, traction. Reads PDF decks directly |
| `provision-inbox` | on | OpenMail pod and inbox per founder, webhook secret kept in `private` schema |
| `draft-email` | on | Claude drafts a first email from the profile and the investor's thesis |
| `send-email` | on | Send from the founder's inbox, log to `outreach_messages` |
| `inbox` | on | List threads, read a thread, reply, mark read (proxied to OpenMail) |
| `openmail-webhook` | off (HMAC) | Inbound mail and inbox suspension events |
| `track-open` | off | 1x1 pixel, records opens |
| `match-investors` | on | Claude picks match keywords from the directory vocabulary, SQL scores everyone, Claude shortlists 25 with reasons |
| `generate-deck` | on | Claude writes an 11-slide deck from the site and five answers, rendered to PDF with hand-drawn charts |
| `process-outbox` | off (cron secret) | Plans follow-ups and sends due Outbox emails within OpenMail's limits |
| `whop` | on | Whop checkout for the monthly plan, tagged with the founder's id, and the manage link |
| `whop-webhook` | off (Standard Webhooks signature) | Keeps `subscriptions` in step with Whop; creates the inbox when a plan is paid |
| `billing` | on | Stripe Checkout and portal (dormant, replaced by Whop) |
| `stripe-webhook` | off (Stripe signature) | Keeps `subscriptions` in step with Stripe |

### Secrets

The Supabase CLI on this machine is logged into a different account, so function secrets live in **Supabase Vault** and are read through `public.get_app_secret()` (service role only): `OPENMAIL_API_KEY`, `FIRECRAWL_API_KEY`, `ANTHROPIC_API_KEY`, `OPENMAIL_SYSTEM_INBOX_ID`, `APP_URL`, `CRON_SECRET`, and once Stripe is connected `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.

**Test mode.** Until the Vault secret `OUTREACH_LIVE` is `true`, every email meant for a directory investor (or an old demo investor) goes to `oliverburt3+centraletest@gmail.com` with a note naming the real recipient. Override the address with `OUTREACH_TEST_RECIPIENT`. If you later run `supabase secrets set`, env vars take precedence over Vault automatically (`_shared/core.ts`).

### Deploying functions

```bash
supabase login
supabase link --project-ref tldvqiqucfmlnkgxaufy
supabase functions deploy
```

(`signup`, `openmail-webhook` and `track-open` need `--no-verify-jwt`.)

### Database

Migrations are in `supabase/migrations`.

**Investor directory.** The raw import lives in `public.contacts` (never readable from the API). A cron job (`sync-investors`, every minute, 2,000 rows per run) syncs it into `public.investors`: one row per email, only people with both an email and a LinkedIn profile, with type, stages, sectors, values, role, region and phones derived from the data. Numbers labelled DNC are never shown. A slim `private.investor_index` (integer keyword ids) keeps search fast as the directory grows.

**Access and limits.** Founders never read contact details from a table. `search_investors`, `investor_facets`, `investor_detail`, `reveal_investor` and `export_investors` are metered security definer functions: contact details are masked until revealed (one credit), exports spend export credits, and plans cap search depth, page size, searches per minute and rows viewed per day. Plans live in `public.plans` (trial, Starter, Pro).

## Known limits

- **OpenMail free plan: 3 inboxes per account.** The fourth signup gets a clear "inbox limit" message and a *Set up inbox* button in the top bar and Settings once the limit is raised. Cold sends are capped at 20 a day per new inbox and 30 a day per account.
- Reply notification links use `APP_URL` from Vault (currently https://www.centralegtm.com).
- PPTX, KEY and DOCX decks are stored but not read yet; PDFs are read by Claude.
- Search takes about 150 to 300ms on today's 13.5k investors on the smallest Supabase instance. At 200k expect it to scale roughly linearly; move to a larger compute size before importing.
- Billing is Whop: one plan, $149 a month, 7-day trial with a card up front. Trial accounts get profile, scrape, deck and a browsable directory with emails and phones truncated; no inbox, sending, reveals or exports until the plan is paid. Stripe code is kept but unused.
- LinkedIn and WhatsApp outreach are researched in `docs/research/multichannel-outreach.md`, not built.

## Brand

Assets from Achraf are in `public/brand` (served) and `docs/brand` (reference). Palette: burgundy `#391c25`, ivory `#f6f1e8`, vermilion `#d94a38`. Headings use Outfit, UI text Geist, margin notes Caveat.
