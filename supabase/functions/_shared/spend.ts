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

/**
 * Channel costs, list prices as of November 2026, for estimates only (the invoices are the truth).
 * Telnyx: a US number is $1 to buy and $1 a month; a recorded browser call to a US number is about $0.015 a minute,
 * transcription $0.005 a minute, answering-machine detection $0.0065 a call. Unipile: about €5 per connected
 * account a month (after a €49 monthly minimum). Monthly items accrue daily in private.accrue_channel_costs().
 */
export const CHANNEL_COSTS = {
  phone_number_setup_usd: 2, // $1 one-time + the first month
  call_usd_per_minute: 0.015,
  transcription_usd_per_minute: 0.005,
  answering_machine_usd: 0.0065,
};

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
