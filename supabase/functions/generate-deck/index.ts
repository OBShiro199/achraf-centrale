// Writes a pitch deck in the founder's brand, with researched and sourced industry figures, and renders it to PDF.
// Runs in the background in two invocations so neither hits the edge function time limit:
//   1. start (founder): checks the limit, records a deck run, captures the brand if missing, researches the industry,
//      then calls stage 2.
//   2. write (internal, service role): Claude writes the slides, the PDF is rendered and stored.
// Every Claude and Firecrawl call is recorded in ai_spend against the run, and the run's total cost is kept.
import { admin, background, HttpError, json, readJson, requireUser, secret, serve, SUPABASE_URL, userClient } from "../_shared/core.ts";
import { HOUSE_STYLE, structured, tidy } from "../_shared/claude.ts";
import { HEADCOUNT, INVESTOR_TYPES, label, REVENUE, SECTORS, STAGES, VALUES } from "../_shared/taxonomy.ts";
import { type Deck, DECK_SCHEMA, renderDeckPdf, SLIDE_TYPES, type Source } from "../_shared/deck.ts";
import { type Brand, refreshBrand } from "../_shared/brand.ts";
import { type Research, researchIndustry } from "../_shared/research.ts";
import { recordSpend } from "../_shared/spend.ts";
import { themeFromBrand } from "../_shared/theme.ts";

const QUESTIONS: Record<string, string> = {
  revenue_history: "Monthly revenue for the last six months, oldest first",
  traction: "Customers, users, pilots and growth",
  raise: "How much they are raising and what it will fund",
  team: "Who is on the team",
  competition: "Who else solves this and why customers choose them",
};

const MAX_SITE_CHARS = 40_000;
/** A run older than this is treated as dead and a new one may start. */
const STALE_MS = 8 * 60_000;
const FACT_SLIDES = new Set(["problem", "market", "why_now"]);

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function load(ownerId: string) {
  const [{ data: startup }, { data: profile }] = await Promise.all([
    admin.from("startups").select("*").eq("owner_id", ownerId).single(),
    admin.from("profiles").select("first_name,last_name,email").eq("id", ownerId).single(),
  ]);
  if (!startup) throw new HttpError(404, "Finish onboarding first");
  return { startup: startup as Row, profile: profile as Row | null };
}

function profileText(startup: Row, founder: string) {
  return `Company: ${startup.name}
Website: ${startup.website_url ?? startup.domain ?? ""}
One-liner: ${startup.one_liner ?? ""}
Summary: ${startup.summary ?? ""}
Mission: ${startup.mission ?? ""}
Business model: ${startup.business_model ?? ""}
Target customer: ${startup.target_customer ?? ""}
Sectors: ${(startup.sectors ?? []).map((s: string) => label(SECTORS, s)).join(", ")}
Location: ${startup.location ?? ""}
Round: ${label(STAGES, startup.stage)}${startup.raise_amount ? `, raising ${startup.raise_amount}` : ""}
Monthly revenue band: ${label(REVENUE, startup.revenue_band)}
Team size: ${label(HEADCOUNT, startup.headcount)}
Values: ${(startup.values ?? []).map((v: string) => label(VALUES, v)).join(", ") || "none stated"}
Wants to hear from: ${(startup.investor_types ?? []).map((v: string) => label(INVESTOR_TYPES, v)).join(", ") || "any investor"}
Founder: ${founder}`;
}

async function stage(ownerId: string, runId: string, name: string) {
  await Promise.all([
    admin.from("startups").update({ deck_stage: name }).eq("owner_id", ownerId),
    admin.from("deck_runs").update({ stage: name }).eq("id", runId),
  ]);
}

async function fail(ownerId: string, runId: string, err: unknown) {
  const message = err instanceof Error ? err.message : "Deck generation failed";
  console.error("deck run failed", runId, err);
  await Promise.all([
    admin.from("startups").update({ deck_status: "error", deck_error: message, deck_stage: null }).eq("owner_id", ownerId),
    admin.from("deck_runs").update({ status: "error", error: message, finished_at: new Date().toISOString() }).eq("id", runId),
  ]);
}

/** Stage 1: brand (if missing), then research, then hand over to stage 2. */
async function research(ownerId: string, runId: string) {
  try {
    let { startup, profile } = await load(ownerId);
    if (!startup.brand && startup.domain) {
      await stage(ownerId, runId, "brand");
      await refreshBrand(ownerId, startup.domain);
      ({ startup, profile } = await load(ownerId));
    }

    await stage(ownerId, runId, "research");
    const founder = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
    let found: Research = { industry: "", summary: "", facts: [], searched_at: new Date().toISOString() };
    try {
      const out = await researchIndustry(profileText(startup, founder));
      found = out.research;
      if (out.usage) await recordSpend({ owner: ownerId, feature: "deck_research", ref: runId }, out.usage);
    } catch (err) {
      // A deck without industry figures is still useful; carry on.
      console.warn("research failed", err);
    }
    await admin.from("startups").update({ deck_research: found }).eq("owner_id", ownerId);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-deck`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "write", owner_id: ownerId, run_id: runId }),
    });
    if (!res.ok) throw new Error(`Could not start writing (${res.status})`);
  } catch (err) {
    await fail(ownerId, runId, err);
  }
}

/** Stage 2: Claude writes the slides from the profile, answers, website and research; render and store. */
async function write(ownerId: string, runId: string) {
  try {
    await stage(ownerId, runId, "writing");
    const { startup, profile } = await load(ownerId);
    const found = (startup.deck_research ?? { facts: [] }) as Research;
    const facts = found.facts ?? [];

    const inputs = (startup.deck_inputs ?? {}) as Record<string, string>;
    const answers = Object.entries(QUESTIONS)
      .map(([k, q]) => `${q}: ${inputs[k]?.trim() || "not given"}`)
      .join("\n");
    const site = typeof startup.scrape?.markdown === "string" ? startup.scrape.markdown.slice(0, MAX_SITE_CHARS) : "";
    const founder = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
    const researchBlock = facts.length
      ? facts.map((f) => `${f.id}: ${f.value}. ${f.claim} (${[f.publisher, f.year].filter(Boolean).join(", ")})`).join("\n")
      : "No researched figures are available.";

    const context = [
      `<profile>\n${profileText(startup, founder)}\n</profile>`,
      `<founder_deck_answers>\n${answers}\n</founder_deck_answers>`,
      `<industry_research industry="${found.industry ?? ""}">\n${found.summary ?? ""}\n${researchBlock}\n</industry_research>`,
      `<website>\n${site || "Not available."}\n</website>`,
    ].join("\n\n");

    const deck = await structured<Deck>({
      system: `You write seed-stage pitch decks for founders. Each slide makes one clear point an investor can check.
Rules:
- The founder's own facts (customers, revenue, team, prices, results) come only from the profile, the founder's answers and the website. Never invent customers, metrics, names or quotes.
- Industry figures come only from the industry research, and only through a slide's facts array, referenced by id (for example s2). Never write an industry figure in a headline, body or bullet unless the same slide lists that fact. Never change or round a researched figure.
- Use facts on the problem slide (what the problem costs or how common it is), the market slide (size, growth, adoption) and optionally why_now. Up to 2 facts on problem and why_now, up to 3 on market. If there is no research, leave facts empty and write the market slide from the profile without figures.
- A strong deck sets the industry's figure against the founder's own result where both exist, for example what the problem costs teams today on the problem slide and the founder's cost or result as the stat on the solution slide.
- Charts only plot numbers the founder gave. Traction: plot the monthly revenue history if given (bar, labels are months, unit like "$k"). Use of funds: plot the percentage split if given (bar, unit "%"). Otherwise set chart kind to "none".
- Team and competition slides use rows. Team rows only list people the founder named; competition rows only list companies the founder or the website named.
- When a slide has little source material, keep it short and true rather than padding it. Never write placeholders or brackets.
- The cover headline states the round and amount if known. The ask slide's stat is the raise amount and its bullets are the use of funds.
${HOUSE_STYLE}`,
      content: [{ type: "text", text: `${context}\n\nWrite the deck for ${startup.name}.` }],
      schema: DECK_SCHEMA,
      effort: "medium",
      maxTokens: 16000,
      track: { owner: ownerId, feature: "deck_write", ref: runId },
    });

    // Number sources in the order they first appear, and keep only figures that exist in the research.
    const byId = new Map(facts.map((f) => [f.id, f]));
    const numbering = new Map<string, number>();
    const byType = new Map(deck.slides.map((s) => [s.type, s]));
    const slides = SLIDE_TYPES.map((t) => byType.get(t))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((s) => {
        const slideFacts = FACT_SLIDES.has(s.type)
          ? (s.facts ?? [])
              .filter((f) => byId.has(f.source_id))
              .slice(0, s.type === "market" ? 3 : 2)
              .map((f) => {
                if (!numbering.has(f.source_id)) numbering.set(f.source_id, numbering.size + 1);
                return { source_id: f.source_id, n: numbering.get(f.source_id)!, value: byId.get(f.source_id)!.value, label: tidy(f.label) };
              })
          : [];
        return {
          ...s,
          kicker: tidy(s.kicker),
          headline: tidy(s.headline),
          body: tidy(s.body),
          bullets: s.bullets.map(tidy).slice(0, 4),
          stat_value: tidy(s.stat_value),
          stat_label: tidy(s.stat_label),
          rows: s.rows.map((r) => ({ label: tidy(r.label), detail: tidy(r.detail) })).slice(0, 5),
          chart: { ...s.chart, title: tidy(s.chart.title), labels: s.chart.labels.map(tidy) },
          facts: slideFacts,
        };
      })
      // An empty market slide (no research and nothing to say) is dropped rather than shown blank.
      .filter((s) => s.type !== "market" || s.facts.length > 0 || s.body || s.bullets.length > 0);

    const sources: Source[] = [...numbering.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([id, n]) => {
        const f = byId.get(id)!;
        return { n, value: f.value, claim: f.claim, source_title: f.source_title, publisher: f.publisher, year: f.year, url: f.url };
      });

    const clean: Deck = {
      company: tidy(deck.company) || startup.name,
      tagline: tidy(deck.tagline),
      slides,
      theme: themeFromBrand(startup.brand as Brand | null),
      sources,
      industry: found.industry || undefined,
    };

    await stage(ownerId, runId, "rendering");
    const fontBase = await secret("APP_URL").catch(() => null);
    const bytes = await renderDeckPdf(clean, { fontBase, website: startup.website_url, email: profile?.email });

    const path = `${ownerId}/generated-${Date.now()}.pdf`;
    const { error: upErr } = await admin.storage.from("decks").upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    const { data: spend } = await admin.from("ai_spend").select("usd").eq("ref_id", runId);
    const usd = (spend ?? []).reduce((sum, r) => sum + Number(r.usd), 0);

    const now = new Date().toISOString();
    await Promise.all([
      admin
        .from("startups")
        .update({ deck_slides: clean, generated_deck_path: path, generated_deck_at: now, deck_status: "done", deck_stage: null, deck_error: null })
        .eq("owner_id", ownerId),
      admin.from("deck_runs").update({ status: "done", stage: null, usd: Number(usd.toFixed(4)), sources: sources.length, finished_at: now }).eq("id", runId),
    ]);
  } catch (err) {
    await fail(ownerId, runId, err);
  }
}

serve(async (req) => {
  const body = await readJson<{ action?: "start" | "write" | "brand"; owner_id?: string; run_id?: string }>(req).catch(() => ({}) as Record<string, never>);

  // Internal hand-over from stage 1.
  if (body.action === "write") {
    if (req.headers.get("Authorization") !== `Bearer ${SERVICE_KEY}` || !body.owner_id || !body.run_id) throw new HttpError(403, "Forbidden");
    background(write(body.owner_id, body.run_id));
    return json({ ok: true }, 202);
  }

  const user = await requireUser(req);
  const { startup } = await load(user.id);

  // Re-read the homepage for colours, fonts, logo, favicon and screenshot. One Firecrawl credit.
  if (body.action === "brand") {
    if (!startup.domain) throw new HttpError(400, "Add your website first");
    const last = startup.brand?.captured_at ? Date.parse(startup.brand.captured_at) : 0;
    if (Date.now() - last < 60_000) throw new HttpError(429, "Your brand was refreshed a moment ago");
    const brand = await refreshBrand(user.id, startup.domain);
    if (!brand) throw new HttpError(502, "We could not read your website just now. Try again in a minute.");
    return json({ ok: true, brand });
  }

  const startedAt = startup.deck_started_at ? Date.parse(startup.deck_started_at) : 0;
  if (startup.deck_status === "running" && Date.now() - startedAt < STALE_MS) {
    throw new HttpError(409, "Your deck is already being written");
  }

  const { data: allowance } = await userClient(req).rpc("deck_allowance");
  const a = (allowance ?? { used: 0, total: 0 }) as { used: number; total: number; next_free_at: string | null };
  if (a.used >= a.total) {
    const when = a.next_free_at ? new Date(a.next_free_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : null;
    throw new HttpError(
      429,
      a.total === 0
        ? "Start your plan to make a deck."
        : `You have used all ${a.total} deck generations for now.${when ? ` The next one frees up on ${when}.` : ""}`,
    );
  }

  const { data: run, error } = await admin.from("deck_runs").insert({ owner_id: user.id, stage: "queued" }).select("id").single();
  if (error || !run) throw error ?? new Error("Could not start the deck");
  await admin
    .from("startups")
    .update({ deck_status: "running", deck_error: null, deck_stage: "research", deck_started_at: new Date().toISOString() })
    .eq("owner_id", user.id);

  background(research(user.id, run.id));
  return json({ ok: true, run_id: run.id, used: a.used + 1, total: a.total }, 202);
});
