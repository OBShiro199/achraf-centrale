// Writes a pitch deck with Claude from the founder's website, profile and deck answers,
// renders it to PDF and stores both the slides (for the in-app viewer) and the file.
import { admin, HttpError, json, requireUser, secret, serve } from "../_shared/core.ts";
import { HOUSE_STYLE, structured, tidy } from "../_shared/claude.ts";
import { HEADCOUNT, INVESTOR_TYPES, label, REVENUE, SECTORS, STAGES, VALUES } from "../_shared/taxonomy.ts";
import { type Deck, DECK_SCHEMA, renderDeckPdf, SLIDE_TYPES } from "../_shared/deck.ts";

const QUESTIONS: Record<string, string> = {
  revenue_history: "Monthly revenue for the last six months, oldest first",
  traction: "Customers, users, pilots and growth",
  raise: "How much they are raising and what it will fund",
  team: "Who is on the team",
  competition: "Who else solves this and why customers choose them",
};

const MAX_SITE_CHARS = 40_000;

serve(async (req) => {
  const user = await requireUser(req);
  const [{ data: startup }, { data: profile }] = await Promise.all([
    admin.from("startups").select("*").eq("owner_id", user.id).single(),
    admin.from("profiles").select("first_name,last_name,email").eq("id", user.id).single(),
  ]);
  if (!startup) throw new HttpError(404, "Finish onboarding first");

  await admin.from("startups").update({ deck_status: "running", deck_error: null }).eq("owner_id", user.id);

  try {
    const inputs = (startup.deck_inputs ?? {}) as Record<string, string>;
    const answers = Object.entries(QUESTIONS)
      .map(([k, q]) => `${q}: ${inputs[k]?.trim() || "not given"}`)
      .join("\n");
    const site = typeof startup.scrape?.markdown === "string" ? startup.scrape.markdown.slice(0, MAX_SITE_CHARS) : "";
    const founder = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");

    const context = [
      `<profile>
Company: ${startup.name}
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
Founder: ${founder}
</profile>`,
      `<founder_deck_answers>\n${answers}\n</founder_deck_answers>`,
      `<website>\n${site || "Not available."}\n</website>`,
    ].join("\n\n");

    const deck = await structured<Deck>({
      system: `You write seed-stage pitch decks for founders. Each slide makes one clear point an investor can check.
Rules:
- Use only facts from the profile, the founder's answers and the website. Never invent customers, metrics, market sizes, names or quotes.
- Charts only plot numbers the founder gave. Traction: plot the monthly revenue history if given (bar, labels are months, unit like "$k"). Use of funds: plot the percentage split if given (bar, unit "%"). Otherwise set chart kind to "none".
- Team and competition slides use rows. Team rows only list people the founder named; competition rows only list companies the founder or the website named.
- When a slide has little source material, keep it short and true rather than padding it. Never write placeholders or brackets.
- The cover headline states the round and amount if known. The ask slide's stat is the raise amount and its bullets are the use of funds.
${HOUSE_STYLE}`,
      content: [{ type: "text", text: `${context}\n\nWrite the deck for ${startup.name}.` }],
      schema: DECK_SCHEMA,
      effort: "medium",
      maxTokens: 16000,
    });

    // Keep the fixed order and tidy every string the model wrote.
    const byType = new Map(deck.slides.map((s) => [s.type, s]));
    const slides = SLIDE_TYPES.map((t) => byType.get(t)).filter((s): s is NonNullable<typeof s> => Boolean(s)).map((s) => ({
      ...s,
      kicker: tidy(s.kicker),
      headline: tidy(s.headline),
      body: tidy(s.body),
      bullets: s.bullets.map(tidy).slice(0, 4),
      stat_value: tidy(s.stat_value),
      stat_label: tidy(s.stat_label),
      rows: s.rows.map((r) => ({ label: tidy(r.label), detail: tidy(r.detail) })).slice(0, 5),
      chart: { ...s.chart, title: tidy(s.chart.title), labels: s.chart.labels.map(tidy) },
    }));
    const clean: Deck = { company: tidy(deck.company) || startup.name, tagline: tidy(deck.tagline), slides };

    const fontBase = await secret("APP_URL").catch(() => null);
    const bytes = await renderDeckPdf(clean, { fontBase, website: startup.website_url, email: profile?.email });

    const path = `${user.id}/generated-${Date.now()}.pdf`;
    const { error: upErr } = await admin.storage.from("decks").upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    const { data: updated, error } = await admin
      .from("startups")
      .update({
        deck_slides: clean,
        generated_deck_path: path,
        generated_deck_at: new Date().toISOString(),
        deck_status: "done",
      })
      .eq("owner_id", user.id)
      .select("deck_slides, generated_deck_path, generated_deck_at, deck_status")
      .single();
    if (error) throw error;

    return json({ ok: true, deck: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Deck generation failed";
    await admin.from("startups").update({ deck_status: "error", deck_error: message }).eq("owner_id", user.id);
    throw err;
  }
});
