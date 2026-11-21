// The Unibox: one conversation per founder, investor and channel (email, LinkedIn, WhatsApp, phone).
// Every channel writes here through these helpers, so the list, unread state, outcome tags and the
// "investor replied" email behave the same whichever way the investor answered.
import { admin, secret } from "./core.ts";
import { HOUSE_STYLE, structured } from "./claude.ts";
import { escapeHtml } from "./mail.ts";
import { openmail } from "./openmail.ts";

export type Channel = "email" | "linkedin" | "whatsapp" | "phone";
export type Outcome = "interested" | "meeting" | "call_back" | "not_now" | "not_interested" | "voicemail" | "no_answer";
export const OUTCOMES: Outcome[] = ["interested", "meeting", "call_back", "not_now", "not_interested", "voicemail", "no_answer"];

export const CHANNEL_LABEL: Record<Channel, string> = { email: "Email", linkedin: "LinkedIn", whatsapp: "WhatsApp", phone: "Phone" };

/** Finds or creates the conversation and moves it to the top with this message as its preview. */
export async function touchConversation(c: {
  owner_id: string;
  channel: Channel;
  external_id: string;
  investor_id?: number | null;
  title?: string | null;
  contact_name?: string | null;
  contact_handle?: string | null;
  preview: string;
  direction: "inbound" | "outbound";
  at?: string;
}) {
  const at = c.at ?? new Date().toISOString();
  const { data: existing } = await admin
    .from("conversations")
    .select("id, investor_id, last_message_at")
    .eq("owner_id", c.owner_id)
    .eq("channel", c.channel)
    .eq("external_id", c.external_id)
    .maybeSingle();
  const preview = c.preview.replace(/\s+/g, " ").trim().slice(0, 240);
  if (existing) {
    // An older message arriving late does not take over the preview.
    const newer = Date.parse(at) >= Date.parse(existing.last_message_at);
    const patch: Record<string, unknown> = { investor_id: existing.investor_id ?? c.investor_id ?? null };
    if (newer) Object.assign(patch, { last_message_at: at, last_preview: preview, last_direction: c.direction });
    if (c.direction === "inbound") patch.unread = true;
    await admin.from("conversations").update(patch).eq("id", existing.id);
    return existing.id as string;
  }
  const { data, error } = await admin
    .from("conversations")
    .upsert(
      {
        owner_id: c.owner_id,
        channel: c.channel,
        external_id: c.external_id,
        investor_id: c.investor_id ?? null,
        title: c.title ?? null,
        contact_name: c.contact_name ?? null,
        contact_handle: c.contact_handle ?? null,
        last_message_at: at,
        last_preview: preview,
        last_direction: c.direction,
        unread: c.direction === "inbound",
      },
      { onConflict: "owner_id,channel,external_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Claude reads an investor's reply or a call transcript and tags where things stand. Positive outcomes move the
 * investor forward on the pipeline. A founder's own tag is never overwritten.
 */
export async function tagOutcome(opts: {
  owner_id: string;
  conversation_id: string;
  investor_id: number | null;
  channel: Channel;
  text: string;
  call_id?: string;
}) {
  const { data: convo } = await admin.from("conversations").select("outcome_source").eq("id", opts.conversation_id).maybeSingle();
  if (convo?.outcome_source === "founder") return null;

  const isCall = opts.channel === "phone";
  const result = await structured<{ outcome: Outcome | "none"; reason: string; summary: string }>({
    system:
      `You read ${isCall ? "the transcript of a call from a startup founder to an investor" : "an investor's reply to a startup founder"} and tag where the conversation stands for the founder's pipeline.
Outcomes: interested (wants to learn more, asks for the deck or data), meeting (agreed a call or meeting, or proposed times), call_back (asked to talk later or at a set time), not_now (too early, not a fit yet, check back later), not_interested (passed or asked not to be contacted), voicemail (${isCall ? "reached voicemail" : "never use for messages"}), no_answer (${isCall ? "nobody spoke" : "never use for messages"}), none (an auto-reply, a question that does not show intent, or unclear).
Reason: one short sentence a founder can scan, quoting the investor where possible. Summary: ${isCall ? "two or three sentences on what was said and agreed, with any next step and date" : "one sentence"}. ${HOUSE_STYLE}`,
    content: [{ type: "text", text: `<${isCall ? "transcript" : "message"}>\n${opts.text.slice(0, 30000)}\n</${isCall ? "transcript" : "message"}>` }],
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["outcome", "reason", "summary"],
      properties: {
        outcome: { type: "string", enum: [...OUTCOMES, "none"] },
        reason: { type: "string" },
        summary: { type: "string" },
      },
    },
    effort: "low",
    maxTokens: 1500,
    track: { owner: opts.owner_id, feature: isCall ? "call_outcome" : "reply_outcome" },
  });

  if (result.outcome !== "none") {
    await admin.from("conversations").update({ outcome: result.outcome, outcome_source: "ai", outcome_reason: result.reason }).eq("id", opts.conversation_id);
    await admin.rpc("advance_pipeline", { p_owner: opts.owner_id, p_investor: opts.investor_id, p_outcome: result.outcome });
  }
  if (opts.call_id) {
    await admin.from("calls").update({ summary: result.summary, ...(result.outcome !== "none" ? { outcome: result.outcome, outcome_source: "ai" } : {}) })
      .eq("id", opts.call_id).is("outcome_source", null);
  }
  return result;
}

/** Emails the founder from the system inbox that an investor answered, with a link into the Unibox. */
export async function notifyFounder(opts: {
  owner_id: string;
  investor: { full_name: string; firm: string };
  channel: Channel;
  preview: string;
  conversation_id: string;
  idempotencyKey: string;
}) {
  const { data: profile } = await admin.from("profiles").select("email").eq("id", opts.owner_id).single();
  if (!profile?.email) return;
  const appUrl = await secret("APP_URL").catch(() => "https://www.centralegtm.com");
  const preview = escapeHtml(opts.preview.split(/\n\s*\n/)[0].slice(0, 280));
  const via = opts.channel === "email" ? "" : ` on ${CHANNEL_LABEL[opts.channel]}`;
  await openmail(`/v1/inboxes/${await secret("OPENMAIL_SYSTEM_INBOX_ID")}/send`, {
    idempotencyKey: opts.idempotencyKey,
    body: {
      to: profile.email,
      subject: `${opts.investor.full_name} replied${via}`,
      body: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#391c25;max-width:520px;background:#f6f1e8;padding:28px;border-radius:10px">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>
<td style="padding:0 3px 0 0"><div style="width:10px;height:10px;background:#d94a38;border-radius:3px"></div></td>
<td style="padding:0 3px"><div style="width:10px;height:10px;background:#391c25;border-radius:3px"></div></td>
<td style="padding:0 3px"><div style="width:10px;height:10px;background:#d94a38;border-radius:3px"></div></td>
<td style="padding:0 3px"><div style="width:10px;height:10px;background:#e8a193;border-radius:3px"></div></td>
<td style="padding:0 0 0 10px;font-weight:600;font-size:15px;color:#391c25">centrale</td></tr></table>
<p style="font-size:22px;line-height:1.25;font-weight:600;margin:0 0 12px">${escapeHtml(opts.investor.full_name)} from ${escapeHtml(opts.investor.firm)} replied${escapeHtml(via)}.</p>
<p style="margin:0 0 20px;color:#6f5f62;border-left:3px solid #d94a38;padding-left:12px">${preview}</p>
<p style="margin:0"><a href="${appUrl}/dashboard/inbox?c=${opts.conversation_id}" style="display:inline-block;background:#391c25;color:#f6f1e8;text-decoration:none;padding:10px 16px;border-radius:6px">Open the conversation</a></p>
<p style="margin:22px 0 0;font-size:12px;color:#9a8d88">Your next round starts here.</p>
</div>`,
    },
  });
}
