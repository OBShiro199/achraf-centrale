// Receives Unipile events. Three kinds arrive here:
//   hosted-auth notify  { status: CREATION_SUCCESS | RECONNECTED, account_id, name: "<owner id>:<provider>" }
//   account status      { AccountStatus: { account_id, account_type, message } }
//   messaging           { event: "message_received", account_id, chat_id, message_id, message, sender, is_sender, ... }
// Unipile does not sign webhooks: the notify URL carries ?secret=, and webhooks created by
// scripts/setup-integrations.mjs send an Unipile-Auth header. Both must equal UNIPILE_WEBHOOK_SECRET.
// Only conversations Centrale started (or with someone in the investor directory) are kept, so a founder's
// personal LinkedIn and WhatsApp chats never reach the Unibox.
import { admin, json, secret, serve } from "../_shared/core.ts";
import { loadInvestor } from "../_shared/investor.ts";
import { notifyFounder, tagOutcome, touchConversation } from "../_shared/unibox.ts";

interface MessageEvent {
  event: string;
  account_id: string;
  account_type?: string;
  chat_id: string;
  message_id: string;
  message?: string | null;
  timestamp?: string;
  is_sender?: boolean;
  is_group?: boolean;
  message_type?: string;
  account_info?: { user_id?: string };
  sender?: { attendee_name?: string; attendee_provider_id?: string; attendee_profile_url?: string };
}

const STATUS_MAP: Record<string, "ok" | "credentials" | "error" | "connecting" | "disconnected"> = {
  OK: "ok",
  SYNC_SUCCESS: "ok",
  RECONNECTED: "ok",
  CREATION_SUCCESS: "connecting",
  CONNECTING: "connecting",
  CREDENTIALS: "credentials",
  PERMISSIONS: "credentials",
  ERROR: "error",
  STOPPED: "error",
  DELETED: "disconnected",
};

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const expected = await secret("UNIPILE_WEBHOOK_SECRET");
  const provided = new URL(req.url).searchParams.get("secret") ?? req.headers.get("unipile-auth");
  if (!provided || provided !== expected) return json({ error: "Unauthorised" }, 401);

  // deno-lint-ignore no-explicit-any
  const body = await req.json() as any;

  // 1. The hosted wizard finished: link the Unipile account to the founder.
  if (body.status && body.account_id && typeof body.name === "string") {
    const [owner, provider] = body.name.split(":");
    if (!owner || (provider !== "linkedin" && provider !== "whatsapp")) return json({ ok: true, ignored: "unknown name" });
    // A new connection replaces an older one for the same channel.
    await admin.from("channel_accounts").update({ status: "disconnected" }).eq("owner_id", owner).eq("provider", provider)
      .neq("unipile_account_id", body.account_id).neq("status", "disconnected");
    const { error } = await admin.from("channel_accounts").upsert(
      { owner_id: owner, provider, unipile_account_id: body.account_id, status: body.status === "RECONNECTED" ? "ok" : "connecting", connected_at: new Date().toISOString(), status_message: null },
      { onConflict: "unipile_account_id" },
    );
    if (error) throw error;
    return json({ ok: true });
  }

  // 2. Account status: syncing finished, credentials expired, account restricted.
  if (body.AccountStatus) {
    const s = body.AccountStatus as { account_id: string; message: string };
    const status = STATUS_MAP[String(s.message).toUpperCase()];
    if (!status) return json({ ok: true, ignored: s.message });
    await admin.from("channel_accounts").update({
      status,
      status_message: status === "credentials" ? "The account signed out or was restricted. Reconnect it in Settings." : null,
    }).eq("unipile_account_id", s.account_id).neq("status", "disconnected");
    return json({ ok: true });
  }

  // 3. A message.
  const e = body as MessageEvent;
  if (e.event !== "message_received" || !e.chat_id || !e.message_id || e.is_group) return json({ ok: true, ignored: e.event ?? "unknown" });

  const { data: account } = await admin.from("channel_accounts").select("owner_id, provider").eq("unipile_account_id", e.account_id).neq("status", "disconnected").maybeSingle();
  if (!account) return json({ ok: true, ignored: "unknown account" });
  const channel = account.provider as "linkedin" | "whatsapp";
  const owner = account.owner_id as string;

  // Messages the founder sent (from Centrale or their phone) also arrive here.
  const outbound = e.is_sender === true || (e.account_info?.user_id && e.account_info.user_id === e.sender?.attendee_provider_id);
  const senderId = e.sender?.attendee_provider_id ?? null;

  // Find the conversation: by chat, else (LinkedIn) the invite we sent to this person, which now has a chat.
  let { data: convo } = await admin.from("conversations").select("id, investor_id, external_id").eq("owner_id", owner).eq("channel", channel).eq("external_id", e.chat_id).maybeSingle();
  if (!convo && senderId && !outbound) {
    const { data: byHandle } = await admin.from("conversations").select("id, investor_id, external_id").eq("owner_id", owner).eq("channel", channel).eq("contact_handle", senderId)
      .order("last_message_at", { ascending: false }).limit(1).maybeSingle();
    if (byHandle) {
      await admin.from("conversations").update({ external_id: e.chat_id }).eq("id", byHandle.id);
      convo = { ...byHandle, external_id: e.chat_id };
    }
  }
  if (!convo) return json({ ok: true, ignored: "not a Centrale conversation" });

  const text = (e.message ?? "").trim() || (e.message_type === "INVITATION" ? "Accepted your invitation" : "(attachment)");
  const { data: inserted } = await admin.from("channel_messages").upsert(
    { owner_id: owner, conversation_id: convo.id, direction: outbound ? "outbound" : "inbound", body: text, external_id: e.message_id, sent_at: e.timestamp ?? new Date().toISOString() },
    { onConflict: "external_id", ignoreDuplicates: true },
  ).select("id");
  if (!inserted?.length) return json({ ok: true, duplicate: true });

  await touchConversation({ owner_id: owner, channel, external_id: e.chat_id, preview: text, direction: outbound ? "outbound" : "inbound", at: e.timestamp });
  if (outbound) return json({ ok: true });

  // An investor answered: stop email follow-ups to them, tag the outcome, tell the founder.
  if (convo.investor_id) {
    await admin.from("scheduled_emails").update({ status: "cancelled", last_error: `Investor replied on ${channel === "linkedin" ? "LinkedIn" : "WhatsApp"}` })
      .eq("owner_id", owner).eq("investor_id", convo.investor_id).eq("kind", "follow_up").eq("status", "queued");
    await admin.rpc("advance_pipeline", { p_owner: owner, p_investor: convo.investor_id, p_outcome: "interested" }).then(() => null, () => null);
  }
  const investor = convo.investor_id ? await loadInvestor(Number(convo.investor_id)).catch(() => null) : null;
  await Promise.allSettled([
    tagOutcome({ owner_id: owner, conversation_id: convo.id, investor_id: convo.investor_id, channel, text }),
    investor
      ? notifyFounder({ owner_id: owner, investor, channel, preview: text, conversation_id: convo.id, idempotencyKey: `unipile-${e.message_id}` })
      : Promise.resolve(),
  ]);
  return json({ ok: true });
});
