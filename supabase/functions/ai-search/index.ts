// AI investor search: a founder describes who they want, Claude turns it into the same filter object the filter
// bar builds, and the sanitiser keeps only whitelisted fields and real values. Claude never touches the database.
// POST { prompt } with the founder's JWT -> { id, title, summary, notes, filters }.
import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
import { admin, HttpError, json, readJson, requireUser, serve, userClient } from "../_shared/core.ts";
import { getClient, MODEL, tidy, usageOf } from "../_shared/claude.ts";
import { recordSpend } from "../_shared/spend.ts";
import { type Facets, fromEntries, sanitize } from "../_shared/lead-filters.ts";
import { OUTPUT_SCHEMA, systemPrompt } from "./translate.ts";

const PER_HOUR = 30;
const PER_DAY = 150;
const MAX_PROMPT = 1000;
const FACET_TTL_MS = 10 * 60_000;
let facetCache: { at: number; facets: Facets } | null = null;

async function loadFacets(req: Request): Promise<Facets> {
  if (facetCache && Date.now() - facetCache.at < FACET_TTL_MS) return facetCache.facets;
  const { data, error } = await userClient(req).rpc("lead_facets");
  if (error) throw error;
  facetCache = { at: Date.now(), facets: (data ?? {}) as Facets };
  return facetCache.facets;
}

serve(async (req) => {
  const user = await requireUser(req);
  const { prompt: raw } = await readJson<{ prompt?: string }>(req);
  const prompt = (raw ?? "").trim().slice(0, MAX_PROMPT);
  if (prompt.length < 3) throw new HttpError(400, "Describe the investors you want to find");

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [{ count: lastHour }, { count: lastDay }] = await Promise.all([
    admin.from("ai_searches").select("id", { count: "exact", head: true }).eq("owner_id", user.id).gte("created_at", hourAgo),
    admin.from("ai_searches").select("id", { count: "exact", head: true }).eq("owner_id", user.id).gte("created_at", dayAgo),
  ]);
  if ((lastHour ?? 0) >= PER_HOUR) throw new HttpError(429, `You can run ${PER_HOUR} AI searches an hour. Edit the filters by hand, or try again shortly.`);
  if ((lastDay ?? 0) >= PER_DAY) throw new HttpError(429, `You have run ${PER_DAY} AI searches today, the daily limit.`);

  const facets = await loadFacets(req);
  const anthropic = await getClient();
  const today = new Date().toISOString().slice(0, 10);

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: [{ type: "text", text: systemPrompt(facets), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Today: ${today}\n\n<request>\n${prompt}\n</request>` }],
    });
  } catch (err) {
    console.error("ai search failed", err);
    throw new HttpError(502, "The AI search is unavailable right now. Use the filters by hand, or try again in a minute.");
  }

  const usage = usageOf(response.model, response.usage);
  await recordSpend({ owner: user.id, feature: "ai_search" }, usage);
  const base = { owner_id: user.id, prompt, model: response.model, input_tokens: usage.input_tokens + usage.cache_read_tokens + usage.cache_write_tokens, output_tokens: usage.output_tokens, usd: Number(usage.usd.toFixed(4)) };

  if (response.stop_reason === "refusal") {
    await admin.from("ai_searches").insert({ ...base, ok: false, notes: ["Declined"] });
    throw new HttpError(422, "That request could not be turned into an investor search. Try describing the investors you want.");
  }
  const text = response.content.find((b) => b.type === "text");
  let parsed: { title?: string; summary?: string; notes?: string[]; filters?: { field: string; values: string[] }[] };
  try {
    parsed = JSON.parse(text && text.type === "text" ? text.text : "");
  } catch {
    await admin.from("ai_searches").insert({ ...base, ok: false });
    throw new HttpError(502, "The AI search returned something unreadable. Try again.");
  }

  const filters = sanitize(fromEntries(parsed.filters ?? []), facets);
  const title = tidy(String(parsed.title ?? "")).slice(0, 80) || "Investor search";
  const summary = tidy(String(parsed.summary ?? "")).slice(0, 300);
  const notes = (parsed.notes ?? []).filter((n) => typeof n === "string").map((n) => tidy(n).slice(0, 200)).filter(Boolean).slice(0, 5);

  const { data: row } = await admin
    .from("ai_searches")
    .insert({ ...base, title, summary, notes, filters, ok: true })
    .select("id, created_at")
    .single();

  return json({ id: row?.id ?? null, title, summary, notes, filters, prompt });
});
