// Drafts a short first email from a founder to one investor.
import { json, readJson, requireUser, serve } from "../_shared/core.ts";
import { HOUSE_STYLE, structured, tidy } from "../_shared/claude.ts";
import { investorId } from "../_shared/investor.ts";
import { outreachContext } from "../_shared/context.ts";

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
  const { investor_id } = await readJson<{ investor_id?: number | string }>(req);

  const { investor, founder, context } = await outreachContext(user.id, investorId(investor_id));

  const draft = await structured<{ subject: string; body: string }>({
    system: `You write first emails from startup founders to investors. They are short, specific and easy to say yes to. Open with the single strongest genuine overlap between the startup and this investor (stage, sector, specialties or what the firm says about itself). The founder has already chosen to contact this investor, so never argue against the fit or apologise for it. Never claim the investor backed a company unless it is named above. Ask for a 20 minute call; if a booking link is given, offer it written out in full on its own line so they can pick a time. Sign off with the founder's first name and company name. Never invent metrics, customers or names that are not in the startup context. Never use placeholders in brackets. ${HOUSE_STYLE}`,
    content: [{ type: "text", text: `${context}\n\nWrite the email from ${founder} to ${investor.full_name}.` }],
    schema: SCHEMA,
    effort: "low",
    maxTokens: 4000,
    track: { owner: user.id, feature: "email_draft" },
  });

  return json({ subject: tidy(draft.subject), body: tidy(draft.body) });
});
