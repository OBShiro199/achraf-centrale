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
2. **Onboarding** (`/onboarding`) saves each answer as it goes and starts the Firecrawl scrape the moment the domain is entered. The last step runs `build-profile` (Claude) and `provision-inbox` (OpenMail) in parallel, then scores investors with the `match_investors()` SQL function.
3. **Dashboard** (`/dashboard`): Home, Investors, Inbox, Startup profile, Settings, Billing. Sending goes through `send-email`, which adds an open-tracking pixel served by `track-open`.
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

### Secrets

The Supabase CLI on this machine is logged into a different account, so function secrets live in **Supabase Vault** and are read through `public.get_app_secret()` (service role only): `OPENMAIL_API_KEY`, `FIRECRAWL_API_KEY`, `ANTHROPIC_API_KEY`, `OPENMAIL_SYSTEM_INBOX_ID`. If you later run `supabase secrets set`, env vars take precedence over Vault automatically (`_shared/core.ts`).

### Deploying functions

```bash
supabase login
supabase link --project-ref tldvqiqucfmlnkgxaufy
supabase functions deploy
```

(`signup`, `openmail-webhook` and `track-open` need `--no-verify-jwt`.)

### Database

Migrations are in `supabase/migrations`, dummy investors in `supabase/seed.sql`. All ten investor emails route to `oliverburt3+N@gmail.com` and phone numbers use reserved fictional ranges.

## Known limits

- **OpenMail free plan: 3 inboxes per account.** The fourth signup gets a clear "inbox limit" message and a *Set up inbox* button in the top bar and Settings once the limit is raised. Cold sends are capped at 20 a day per new inbox and 30 a day per account.
- Reply notification links use `APP_URL` from Vault (currently https://achraf-centrale.vercel.app).
- PPTX, KEY and DOCX decks are stored but not read yet; PDFs are read by Claude.
- "Make one for me" records the request; deck generation, follow-ups and Stripe checkout are next.
- Matching is the weighted SQL score; thesis embeddings and the Claude conflict review from the brief are the next pass.

## Brand

Assets from Achraf are in `public/brand` (served) and `docs/brand` (reference). Palette: burgundy `#391c25`, ivory `#f6f1e8`, vermilion `#d94a38`. Headings use Outfit, UI text Geist, margin notes Caveat.
