import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
import { secret } from "./core.ts";

export const MODEL = "claude-opus-5";

let client: Anthropic | null = null;

async function getClient() {
  client ??= new Anthropic({ apiKey: await secret("ANTHROPIC_API_KEY") });
  return client;
}

export const HOUSE_STYLE = [
  "Write in plain, literal sentences. Describe mechanism, not benefit.",
  "Never use em dashes or en dashes as punctuation; use commas or full stops.",
  "No exclamation marks, no emoji, no hype words (unlock, leverage, seamless, revolutionary, game-changing).",
  "Sentence case. Numbers and specifics over adjectives.",
].join(" ");

/**
 * One structured-output call. Uses server-side fallbacks so a classifier
 * decline is retried on the recommended fallback model instead of failing.
 */
export async function structured<T>(opts: {
  system: string;
  content: Anthropic.ContentBlockParam[];
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<T> {
  const anthropic = await getClient();
  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: opts.effort ?? "medium", format: { type: "json_schema", schema: opts.schema } },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  });

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
