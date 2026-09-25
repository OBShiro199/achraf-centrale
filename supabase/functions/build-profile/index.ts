// Writes the founder's startup profile with Claude from the site scrape, their
// onboarding answers and (when it is a PDF) their pitch deck.
import type Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { admin, HttpError, json, requireUser, serve } from "../_shared/core.ts";
import { HOUSE_STYLE, structured, tidy } from "../_shared/claude.ts";
import { HEADCOUNT, INVESTOR_TYPES, label, REVENUE, SECTORS, STAGES, VALUES } from "../_shared/taxonomy.ts";

interface Profile {
  name: string;
  one_liner: string;
  summary: string;
  mission: string;
  goal: string;
  sectors: string[];
  keywords: string[];
  business_model: string;
  target_customer: string;
  traction_signals: string[];
  location: string;
  investor_angle: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "name", "one_liner", "summary", "mission", "goal", "sectors", "keywords",
    "business_model", "target_customer", "traction_signals", "location", "investor_angle",
  ],
  properties: {
    name: { type: "string", description: "Company name as the company writes it." },
    one_liner: { type: "string", description: "One sentence, under 20 words, saying what the company does and for whom." },
    summary: { type: "string", description: "Three to four sentences explaining who they are, what they sell, how it works and who buys it." },
    mission: { type: "string", description: "One sentence mission, in the company's own terms where possible." },
    goal: { type: "string", description: "One or two sentences on what this raise is likely to fund and the next milestone." },
    sectors: {
      type: "array",
      description: "One to three sectors, most relevant first.",
      items: { type: "string", enum: Object.keys(SECTORS) },
    },
    keywords: { type: "array", description: "Five to eight short keywords an investor thesis would mention.", items: { type: "string" } },
    business_model: { type: "string", description: "How they make money, one sentence." },
    target_customer: { type: "string", description: "Who buys, one sentence." },
    traction_signals: {
      type: "array",
      description: "Concrete traction facts stated on the website or in the deck (customers, users, growth, partners, awards). Do not repeat the founder answers such as team size or revenue band. Empty if none are stated.",
      items: { type: "string" },
    },
    location: { type: "string", description: "Headquarters city and country if stated, otherwise an empty string." },
    investor_angle: { type: "string", description: "One sentence an investor would find compelling, based only on facts in the sources." },
  },
};

const MAX_SITE_CHARS = 60_000;
const MAX_DECK_BYTES = 30 * 1024 * 1024;

serve(async (req) => {
  const user = await requireUser(req);

  const [{ data: startup, error }, { data: profile }] = await Promise.all([
    admin.from("startups").select("*").eq("owner_id", user.id).single(),
    admin.from("profiles").select("first_name,last_name").eq("id", user.id).single(),
  ]);
  if (error || !startup) throw new HttpError(404, "Startup not found");

  await admin.from("startups").update({ analysis_status: "running", analysis_error: null }).eq("owner_id", user.id);

  try {
    const content: Anthropic.ContentBlockParam[] = [];

    // Pitch deck: PDFs go to Claude directly. Other formats are noted but not parsed yet.
    let deckNote = "No pitch deck uploaded.";
    if (startup.deck_path) {
      const isPdf = startup.deck_mime === "application/pdf" || startup.deck_filename?.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const { data: file } = await admin.storage.from("decks").download(startup.deck_path);
        if (file && file.size <= MAX_DECK_BYTES) {
          content.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: encodeBase64(new Uint8Array(await file.arrayBuffer())) },
            title: startup.deck_filename ?? "Pitch deck",
          });
          deckNote = "The founder's pitch deck is attached above. Treat it as the source of truth where it disagrees with the website.";
        } else {
          deckNote = "A pitch deck was uploaded but is too large to read here.";
        }
      } else {
        deckNote = `A pitch deck was uploaded as ${startup.deck_filename}; its contents are not available here.`;
      }
    } else if (startup.wants_generated_deck) {
      deckNote = "The founder has no deck yet and asked us to make one later.";
    }

    const scrape = startup.scrape ?? {};
    const site = typeof scrape.markdown === "string" ? scrape.markdown.slice(0, MAX_SITE_CHARS) : "";

    const answers = [
      `Founder: ${[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "unknown"}`,
      `Domain: ${startup.domain ?? "unknown"}`,
      `Team size: ${label(HEADCOUNT, startup.headcount) || "not given"}`,
      `Values: ${(startup.values ?? []).map((v: string) => label(VALUES, v)).join(", ") || "none selected"}`,
      `Raising: ${label(STAGES, startup.stage) || "not given"}`,
      `Wants to hear from: ${(startup.investor_types ?? []).map((v: string) => label(INVESTOR_TYPES, v)).join(", ") || "any investor type"}`,
      `Revenue: ${label(REVENUE, startup.revenue_band) || "not given"}`,
    ].join("\n");

    content.push({
      type: "text",
      text: [
        `<founder_answers>\n${answers}\n</founder_answers>`,
        `<website url="${scrape.url ?? ""}" title="${scrape.title ?? ""}">\n${site || "The website could not be read."}\n</website>`,
        `<deck_note>${deckNote}</deck_note>`,
        "Write this startup's profile for an investor database. Use only facts found in the sources; where something is not stated, write the most neutral accurate sentence you can rather than inventing numbers.",
      ].join("\n\n"),
    });

    const result = await structured<Profile>({
      system: `You write startup profiles that founders send to investors. ${HOUSE_STYLE}`,
      content,
      schema: SCHEMA,
      effort: "medium",
    });

    const clean = {
      name: tidy(result.name) || startup.name,
      one_liner: tidy(result.one_liner),
      summary: tidy(result.summary),
      mission: tidy(result.mission),
      goal: tidy(result.goal),
      sectors: [...new Set(result.sectors.filter((s) => s in SECTORS))].slice(0, 3),
      keywords: result.keywords.slice(0, 8).map(tidy),
      business_model: tidy(result.business_model),
      target_customer: tidy(result.target_customer),
    };

    const { data: updated, error: updateError } = await admin
      .from("startups")
      .update({
        ...clean,
        location: startup.location || result.location || null,
        traction: startup.traction || result.traction_signals.map(tidy).join("\n") || null,
        analysis: { ...result, model_input_had_deck: content.length > 1 },
        analysis_status: "done",
        analysed_at: new Date().toISOString(),
      })
      .eq("owner_id", user.id)
      .select()
      .single();
    if (updateError) throw updateError;

    return json({ ok: true, startup: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Profile build failed";
    await admin.from("startups").update({ analysis_status: "error", analysis_error: message }).eq("owner_id", user.id);
    throw err;
  }
});
