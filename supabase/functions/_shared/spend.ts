// Records what each AI or scraping call cost, so staff can see the running cost per founder and per deck.
import { admin } from "./core.ts";
import type { Usage } from "./claude.ts";

export interface SpendTag {
  owner: string | null;
  feature: string;
  ref?: string | null;
}

/** Firecrawl bills in credits; this is the per-credit price on the Standard plan, used for estimates only. */
export const FIRECRAWL_USD_PER_CREDIT = 0.00083;

export async function recordSpend(tag: SpendTag, usage: Partial<Usage> & { firecrawl_credits?: number }) {
  const firecrawl = usage.firecrawl_credits ?? 0;
  const usd = (usage.usd ?? 0) + firecrawl * FIRECRAWL_USD_PER_CREDIT;
  const { error } = await admin.from("ai_spend").insert({
    owner_id: tag.owner,
    feature: tag.feature,
    ref_id: tag.ref ?? null,
    model: usage.model ?? null,
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_read_tokens: usage.cache_read_tokens ?? 0,
    cache_write_tokens: usage.cache_write_tokens ?? 0,
    web_searches: usage.web_searches ?? 0,
    firecrawl_credits: firecrawl,
    usd: Number(usd.toFixed(4)),
  });
  // Cost tracking must never break the feature it measures.
  if (error) console.warn("could not record spend", error.message);
  return usd;
}
