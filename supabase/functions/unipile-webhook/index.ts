// Receives Unipile v2 events for the webhook endpoint created by scripts/setup-integrations.mjs. Every request is
// signed (unipile-signature: t=…,v0=HMAC-SHA256(secret, "t.body")) with the endpoint's secret, kept in Vault as
// UNIPILE_WEBHOOK_SECRET. Unipile wants a reply within 5 seconds, so slow work (Claude, emails) runs after replying.
//
//   account.add / account.reconnect   { account, state: "<owner id>:<provider>" }  link the account to the founder
//   account.remove                    { account: { id } }
//   account.status.*                  running, disconnected, errored, partial, degraded
//   relation.new                      a LinkedIn invite was accepted (can arrive hours later)
//   message.new                       a message in a chat, sent or received (is_sender tells which)
//
// Only conversations Centrale started (or invites it sent) are kept, so a founder's personal chats never reach it.
import { admin, background, json, secret, serve } from "../_shared/core.ts";
import { loadInvestor } from "../_shared/investor.ts";
import { escapeHtml } from "../_shared/mail.ts";
import { openmail } from "../_shared/openmail.ts";
import { verifyUnipileSignature } from "../_shared/unipile.ts";
import { notifyFounder, tagOutcome, touchConversation } from "../_shared/unibox.ts";

interface Envelope {
  id: string;
  type: string;
  account_id?: string;
  account_provider?: string;
  // deno-lint-ignore no-explicit-any
  payload: any;
}

interface Message {
  id: string;
  chat_id: string;
  text?: string | null;
  sender_id?: string;
  is_sender?: boolean;
  timestamp?: string;
}

const STATUS: Record<string, "ok" | "credentials" | "error"> = {
  "account.status.running": "ok",
  "account.status.disconnected": "credentials",
  "account.status.errored": "error",
};

async function emailReconnect(ownerId: string, provider: "linkedin" | "whatsapp", accountId: string) {
  const { data: profile } = await admin.from("profiles").select("email, first_name").eq("id", ownerId).maybeSingle();
  if (!profile?.email) return;
  const app = (await secret("APP_URL").catch(() => "https://www.centralegtm.com")).replace(/\/$/, "");
  const name = provider === "linkedin" ? "LinkedIn" : "WhatsApp";
  await openmail(`/v1/inboxes/${await secret("OPENMAIL_SYSTEM_INBOX_ID")}/send`, {
    idempotencyKey: `reconnect-${accountId}-${new Date().toISOString().slice(0, 10)}`,
    body: {
      to: profile.email,
      subject: `Reconnect your ${name} to Centrale`,
      body: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#391c25;max-width:520px">
<p>Hi ${escapeHtml(profile.first_name ?? "there")},</p>
<p>${name} signed your account out of Centrale, so messages to investors cannot go and replies will not reach your Inbox until you reconnect. It takes a minute.</p>
<p><a href="${app}/dashboard/settings#channels" style="display:inline-block;background:#391c25;color:#f6f1e8;text-decoration:none;padding:10px 16px;border-radius:6px">Reconnect ${name}</a></p>
<p style="font-size:12px;color:#9a8d88">This usually happens after a password change, signing out of other sessions, or a security check by ${name}.</p>
</div>`,
    },
  });
}

/** After an investor answers: stop email follow-ups, move the pipeline, tag the reply, email the founder. */
async function onInvestorReply(owner: string, channel: "linkedin" | "whatsapp", convo: { id: string; investor_id: number | null }, text: string, messageId: string) {
  if (convo.investor_id) {
    await admin.from("scheduled_emails").update({ status: "cancelled", last_error: `Investor replied on ${channel === "linkedin" ? "LinkedIn" : "WhatsApp"}` })
      .eq("owner_id", owner).eq("investor_id", convo.investor_id).eq("kind", "follow_up").eq("status", "queued");
    await admin.rpc("advance_pipeline", { p_owner: owner, p_investor: convo.investor_id, p_outcome: "interested" }).then(() => null, () => null);
  }
  const investor = convo.investor_id ? await loadInvestor(Number(convo.investor_id)).catch(() => null) : null;
  const results = await Promise.allSettled([
    tagOutcome({ owner_id: owner, conversation_id: convo.id, investor_id: convo.investor_id, channel, text }),
    investor ? notifyFounder({ owner_id: owner, investor, channel, preview: text, conversation_id: convo.id, idempotencyKey: `unipile-${messageId}` }) : Promise.resolve(),
  ]);
  for (const r of results) if (r.status === "rejected") console.error("reply follow-up failed", r.reason);
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await req.text();
  const key = await secret("UNIPILE_WEBHOOK_SECRET").catch(() => null);
  if (!key?.trim() || !(await verifyUnipileSignature(raw, req.headers.get("unipile-signature"), key))) return json({ error: "Invalid signature" }, 401);

  const ev = JSON.parse(raw) as Envelope;
  const { data: fresh } = await admin.rpc("claim_webhook_event", { p_event_id: `unipile:${ev.id}` });
  if (!fresh) return json({ ok: true, duplicate: true });
  const accountId = ev.account_id ?? ev.payload?.account?.id;

  // 1. A founder finished Unipile's connect page: link the account to them.
  if (ev.type === "account.add" || ev.type === "account.reconnect") {
    const [owner, provider] = String(ev.payload?.state ?? "").split(":");
    if (!owner || (provider !== "linkedin" && provider !== "whatsapp") || !accountId) return json({ ok: true, ignored: "no state" });
    // A new connection replaces an older one for the same channel.
    await admin.from("channel_accounts").update({ status: "disconnected" }).eq("owner_id", owner).eq("provider", provider)
      .neq("unipile_account_id", accountId).neq("status", "disconnected");
    const { error } = await admin.from("channel_accounts").upsert(
      { owner_id: owner, provider, unipile_account_id: accountId, status: "ok", display_name: ev.payload?.account?.name ?? null, connected_at: new Date().toISOString(), status_message: null },
      { onConflict: "unipile_account_id" },
    );
    if (error) throw error;
    return json({ ok: true });
  }

  if (!accountId) return json({ ok: true, ignored: "no account" });
  const { data: account } = await admin.from("channel_accounts").select("id, owner_id, provider, status").eq("unipile_account_id", accountId).neq("status", "disconnected").maybeSingle();
  if (!account) return json({ ok: true, ignored: "unknown account" });
  const owner = account.owner_id as string;
  const channel = account.provider as "linkedin" | "whatsapp";

  // 2. The account was removed at Unipile, or its connection changed.
  if (ev.type === "account.remove") {
    await admin.from("channel_accounts").update({ status: "disconnected" }).eq("id", account.id);
    return json({ ok: true });
  }
  const status = STATUS[ev.type];
  if (status) {
    await admin.from("channel_accounts").update({
      status,
      status_message: status === "credentials" ? "The account signed out or was restricted. Reconnect it in Settings." : status === "error" ? "The connection is failing. Reconnect it in Settings." : null,
    }).eq("id", account.id);
    // Tell the founder once, when a working account drops.
    if (status !== "ok" && account.status === "ok") background(emailReconnect(owner, channel, accountId).catch((err) => console.error("reconnect email failed", err)));
    return json({ ok: true });
  }

  // 3. A LinkedIn invite was accepted: say so on the conversation, so the founder can message them.
  if (ev.type === "relation.new") {
    const userId = ev.payload?.user?.id;
    if (!userId) return json({ ok: true });
    const { data: invite } = await admin.from("conversations").select("id").eq("owner_id", owner).eq("channel", "linkedin").eq("external_id", `invite:${userId}`).maybeSingle();
    if (invite) await admin.from("conversations").update({ last_preview: "Accepted your invitation. You can message them now.", last_message_at: new Date().toISOString(), last_direction: "inbound", unread: true }).eq("id", invite.id);
    return json({ ok: true });
  }

  if (ev.type !== "message.new") return json({ ok: true, ignored: ev.type });

  // 4. A message, sent (from Centrale or the founder's phone) or received.
  const m = ev.payload as Message;
  if (!m?.id || !m.chat_id) return json({ ok: true, ignored: "no message" });
  const outbound = m.is_sender === true;

  // Find the conversation: by chat, else (LinkedIn) the invite we sent to this person, which now has a chat.
  let { data: convo } = await admin.from("conversations").select("id, investor_id").eq("owner_id", owner).eq("channel", channel).eq("external_id", m.chat_id).maybeSingle();
  if (!convo && m.sender_id && !outbound) {
    const { data: invite } = await admin.from("conversations").select("id, investor_id").eq("owner_id", owner).eq("channel", channel).eq("contact_handle", m.sender_id)
      .like("external_id", "invite:%").order("last_message_at", { ascending: false }).limit(1).maybeSingle();
    if (invite) {
      await admin.from("conversations").update({ external_id: m.chat_id }).eq("id", invite.id);
      convo = invite;
    }
  }
  if (!convo) return json({ ok: true, ignored: "not a Centrale conversation" });

  const text = (m.text ?? "").trim() || "(attachment)";
  const { data: inserted } = await admin.from("channel_messages").upsert(
    { owner_id: owner, conversation_id: convo.id, direction: outbound ? "outbound" : "inbound", body: text, external_id: m.id, sent_at: m.timestamp ?? new Date().toISOString() },
    { onConflict: "external_id", ignoreDuplicates: true },
  ).select("id");
  if (!inserted?.length) return json({ ok: true, duplicate: true });

  await touchConversation({ owner_id: owner, channel, external_id: m.chat_id, preview: text, direction: outbound ? "outbound" : "inbound", at: m.timestamp });
  if (!outbound) background(onInvestorReply(owner, channel, convo, text, m.id));
  return json({ ok: true });
});
