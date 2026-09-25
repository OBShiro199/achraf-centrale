// Drafts a short first email from a founder to one investor.
import { admin, HttpError, json, readJson, requireUser, serve } from "../_shared/core.ts";
import { HOUSE_STYLE, structured, tidy } from "../_shared/claude.ts";
import { INVESTOR_TYPES, label, REVENUE, SECTORS, STAGES, VALUES } from "../_shared/taxonomy.ts";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body"],
  properties: {
    subject: { type: "string", description: "Under 8 words, lower friction, no clickbait, no company tagline." },
    body: {
      type: "string",
      description: "Plain text email body, at most 100 words, with a greeting line, two short paragraphs and a sign-off. Use at most two traction facts. Paragraphs separated by a blank line.",
    },
  },
};

serve(async (req) => {
  const user = await requireUser(req);
  const { investor_id } = await readJson<{ investor_id?: string }>(req);
  if (!investor_id) throw new HttpError(400, "Pick an investor");

  const [{ data: investor }, { data: startup }, { data: profile }] = await Promise.all([
    admin.from("investors").select("*").eq("id", investor_id).single(),
    admin.from("startups").select("*").eq("owner_id", user.id).single(),
    admin.from("profiles").select("first_name,last_name").eq("id", user.id).single(),
  ]);
  if (!investor) throw new HttpError(404, "Investor not found");
  if (!startup) throw new HttpError(404, "Finish onboarding first");

  const founder = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "the founder";

  const context = `<startup>
Name: ${startup.name}
Website: ${startup.website_url ?? startup.domain}
One-liner: ${startup.one_liner ?? ""}
Summary: ${startup.summary ?? ""}
Sectors: ${(startup.sectors ?? []).map((s: string) => label(SECTORS, s)).join(", ")}
Raising: ${label(STAGES, startup.stage)} ${startup.raise_amount ? `(${startup.raise_amount})` : ""}
Revenue: ${label(REVENUE, startup.revenue_band)}
Traction: ${startup.traction ?? "not stated"}
Values: ${(startup.values ?? []).map((v: string) => label(VALUES, v)).join(", ") || "none stated"}
Founder: ${founder}
</startup>

<investor>
Name: ${investor.full_name}, ${investor.title} at ${investor.firm}
Type: ${label(INVESTOR_TYPES, investor.investor_type)}
Stages: ${(investor.stages ?? []).map((s: string) => label(STAGES, s)).join(", ")}
Sectors: ${(investor.sectors ?? []).map((s: string) => label(SECTORS, s)).join(", ")}
Thesis: ${investor.thesis ?? ""}
Portfolio: ${(investor.portfolio ?? []).join(", ")}
Focus: ${investor.focus_note ?? ""}
Values: ${(investor.values ?? []).map((v: string) => label(VALUES, v)).join(", ") || "none stated"}
</investor>`;

  const draft = await structured<{ subject: string; body: string }>({
    system: `You write first emails from startup founders to investors. They are short, specific and easy to say yes to. Open with the single strongest genuine overlap between the startup and this investor (stage, sector, values, thesis or focus). The founder has already chosen to contact this investor, so never argue against the fit or apologise for it. Name portfolio companies only to show you know the fund; never claim anything about what those companies do. Ask for a 20 minute call. Sign off with the founder's first name and company name. Never invent metrics, customers or names that are not in the startup context. Never use placeholders in brackets. ${HOUSE_STYLE}`,
    content: [{ type: "text", text: `${context}\n\nWrite the email from ${founder} to ${investor.full_name}.` }],
    schema: SCHEMA,
    effort: "low",
    maxTokens: 4000,
  });

  return json({ subject: tidy(draft.subject), body: tidy(draft.body) });
});
