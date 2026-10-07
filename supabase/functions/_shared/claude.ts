import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
import { secret } from "./core.ts";
import { recordSpend, type SpendTag } from "./spend.ts";

export const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;

export async function getClient() {
  client ??= new Anthropic({ apiKey: await secret("ANTHROPIC_API_KEY") });
  return client;
}

export const HOUSE_STYLE = [
  "Write in plain, literal sentences. Describe mechanism, not benefit.",
  "Never use em dashes or en dashes as punctuation; use commas or full stops.",
  "No exclamation marks, no emoji, no hype words (unlock, leverage, seamless, revolutionary, game-changing).",
  "Sentence case. Numbers and specifics over adjectives.",
].join(" ");

/** US dollars per million tokens. Cache writes are 1.25x input; web search is $10 per 1,000 searches. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};
const WEB_SEARCH_USD = 0.01;

export interface Usage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  web_searches: number;
  usd: number;
}

// deno-lint-ignore no-explicit-any
export function usageOf(model: string, u: any): Usage {
  const price = PRICES[model] ?? PRICES[Object.keys(PRICES).find((k) => model.startsWith(k)) ?? MODEL];
  const input = u?.input_tokens ?? 0;
  const output = u?.output_tokens ?? 0;
  const cacheRead = u?.cache_read_input_tokens ?? 0;
  const cacheWrite = u?.cache_creation_input_tokens ?? 0;
  const searches = u?.server_tool_use?.web_search_requests ?? 0;
  const usd =
    (input * price.input + output * price.output + cacheRead * price.cacheRead + cacheWrite * price.input * 1.25) / 1_000_000 +
    searches * WEB_SEARCH_USD;
  return { model, input_tokens: input, output_tokens: output, cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite, web_searches: searches, usd };
}

export function addUsage(a: Usage | null, b: Usage): Usage {
  if (!a) return b;
  return {
    model: b.model,
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_tokens: a.cache_read_tokens + b.cache_read_tokens,
    cache_write_tokens: a.cache_write_tokens + b.cache_write_tokens,
    web_searches: a.web_searches + b.web_searches,
    usd: a.usd + b.usd,
  };
}

/**
 * One structured-output call. Uses server-side fallbacks so a classifier
 * decline is retried on the recommended fallback model instead of failing.
 * Pass `track` to record what the call cost against a founder and feature.
 */
export async function structured<T>(opts: {
  system: string;
  content: Anthropic.ContentBlockParam[];
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  track?: SpendTag;
}): Promise<T> {
  const anthropic = await getClient();
  const response = await anthropic.beta.messages
    .stream({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort ?? "medium", format: { type: "json_schema", schema: opts.schema } },
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
    })
    .finalMessage();

  if (opts.track) await recordSpend(opts.track, usageOf(response.model, response.usage));

  if (response.stop_reason === "refusal") throw new Error("The model declined this request");
  if (response.stop_reason === "max_tokens") throw new Error("The model ran out of room before finishing");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("The model returned no text");
  return JSON.parse(text.text) as T;
}

/** Replaces em and en dashes the model may still produce. */
export function tidy(text: string): string {
  return text.replace(/\s*[—]\s*/g, ", ").replace(/\s[–]\s/g, ", ").replace(/,\s*,/g, ",").trim();
}
