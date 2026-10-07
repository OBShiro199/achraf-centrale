@AGENTS.md

## Project notes

- Product name is **Centrale**. Brand colours are tokens in `src/app/globals.css` (`burgundy`, `ivory`, `vermilion`); do not hard-code new hex values without adding a token.
- Copy voice: sentence case, no em dashes, no exclamation marks, no emoji, no "unlock/leverage/seamless". Claude prompts share `HOUSE_STYLE` in `supabase/functions/_shared/claude.ts`.
- Edge functions are Deno; `src/lib/taxonomy.ts` mirrors `supabase/functions/_shared/taxonomy.ts` and both must change together.
- Function secrets come from Supabase Vault via `get_app_secret()`; never commit keys.
- Deno refuses npm versions published in the last 24h, so pin slightly older versions in `npm:` specifiers.
- In-app documentation lives in `src/content/docs.tsx` (rendered at `/dashboard/docs`). Every change to product behaviour, limits, pricing, copy users rely on or flows must update the matching docs section, the "What's new" changelog and `DOCS_UPDATED` in the same change.
- AI and scraping costs are recorded in `ai_spend` (pass `track` to `structured()`, or call `recordSpend`); new Claude or Firecrawl calls must be tracked.
