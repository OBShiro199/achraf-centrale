// Industry research for the pitch deck: Claude searches the web for a handful of real, sourced
// statistics about the founder's market. Every fact must point at a page the search actually returned;
// anything else is dropped, so the deck never shows a number without a checkable source.
import type Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
import { addUsage, getClient, HOUSE_STYLE, MODEL, tidy, type Usage, usageOf } from "./claude.ts";

export interface ResearchFact {
  id: string;
  /** The number itself, e.g. "$10,000" or "62%". */
  value: string;
  /** What the number measures, one sentence. */
  claim: string;
  source_title: string;
  publisher: string;
  year: string;
  url: string;
}

export interface Research {
  industry: string;
  summary: string;
  facts: ResearchFact[];
  searched_at: string;
}

/** Search results dominate the cost (input tokens), so keep searches few and targeted. */
const MAX_SEARCHES = 4;

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(raw);
}

const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();

export async function researchIndustry(profile: string): Promise<{ research: Research; usage: Usage | null }> {
  const anthropic = await getClient();
  const system = `You research markets for seed-stage pitch decks. Run a few targeted web searches (combine topics in one query where you can) to find 4 to 6 recent, specific, quantitative facts about the industry and problem the startup works on: market size and growth, how much the problem costs the target customer today (money or time), how common the problem is, and adoption trends. Prefer primary or reputable sources (analyst firms, government statistics, industry surveys, established publications) from the last four years. Do not use the startup's own website or its competitors' marketing pages as a source.

Every fact must come from a page you actually opened in search results, and the url must be that page. Quote numbers exactly as the source states them. If you cannot find a good source for something, leave it out rather than estimating.

When you are done, reply with only a JSON object in a \`\`\`json block:
{"industry": "the industry in a few words", "summary": "two sentences on the market, citing nothing new", "facts": [{"value": "only the figure, at most 10 characters, e.g. $10,000 or 62% or $4.5B", "claim": "one sentence saying what the figure measures, for whom and when, under 25 words", "source_title": "page or report title", "publisher": "organisation", "year": "publication year", "url": "https://..."}]}
${HOUSE_STYLE}`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: `<startup>\n${profile}\n</startup>\n\nResearch this startup's market.` }];
  let usage: Usage | null = null;
  const seen = new Set<string>();
  let final: Anthropic.Beta.BetaMessage | null = null;

  // Server tools can pause a long turn; continue it a few times at most.
  for (let turn = 0; turn < 4; turn++) {
    const response = await anthropic.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES }],
        messages,
      })
      .finalMessage();
    usage = addUsage(usage, usageOf(response.model, response.usage));

    for (const block of response.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === "web_search_result" && r.url) seen.add(norm(r.url));
      }
    }
    final = response;
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }

  if (!final || final.stop_reason === "refusal") throw new Error("Research was declined");
  const text = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: { industry?: string; summary?: string; facts?: Partial<ResearchFact>[] } = {};
  try {
    parsed = extractJson(text);
  } catch {
    console.warn("research returned no JSON");
  }

  const facts: ResearchFact[] = [];
  for (const f of parsed.facts ?? []) {
    if (!f?.value || !f.claim || !f.url || !/^https?:\/\//.test(f.url)) continue;
    // Only keep facts whose page the search really returned.
    if (seen.size && !seen.has(norm(f.url))) continue;
    facts.push({
      id: `s${facts.length + 1}`,
      value: tidy(String(f.value)).slice(0, 16),
      claim: tidy(String(f.claim)).slice(0, 220),
      source_title: tidy(String(f.source_title ?? "")).slice(0, 160),
      publisher: tidy(String(f.publisher ?? "")).slice(0, 80),
      year: String(f.year ?? "").slice(0, 4),
      url: f.url,
    });
    if (facts.length >= 6) break;
  }

  return {
    research: {
      industry: tidy(parsed.industry ?? ""),
      summary: tidy(parsed.summary ?? ""),
      facts,
      searched_at: new Date().toISOString(),
    },
    usage,
  };
}
