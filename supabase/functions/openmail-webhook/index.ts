// Receives OpenMail events for founder inboxes: records investor replies and emails the founder a heads-up
// from the system inbox. Bounces stop that address being emailed again, out-of-office replies are ignored so
// follow-ups still go out, and an inbox OpenMail suspends is paused here and reported to staff.
import { admin, json, serve } from "../_shared/core.ts";
import { verifySignature } from "../_shared/openmail.ts";
import { findInvestorByEmail, loadInvestor } from "../_shared/investor.ts";
import { suppress } from "../_shared/mail.ts";
import { notifyFounder, tagOutcome, touchConversation } from "../_shared/unibox.ts";
import { bouncedAddresses, isAutoReply, isPermanentBounce } from "../_shared/bounce.ts";
import { emailStaff } from "../_shared/staff.ts";

interface ReceivedEvent {
  event: string;
  event_id: string;
  inbox_id: string | null;
  thread_id?: string;
  reason?: string | null;
  message?: {
    id: string;
    from: string;
    to: string;
    subject: string;
    body_text: string;
    received_at: string;
    category?: "personal" | "automated" | "marketing" | "bounce" | "spam" | "malicious";
  };
}

type Inbox = { id: string; owner_id: string; address: string };

/**
 * A delivery report for one of our emails. A permanent failure marks the email bounced, puts the address on the
 * do-not-email list for every founder and cancels anything still queued to it. In test mode the email went to
 * the test inbox, not the investor, so the investor's address is left alone.
 */
async function handleBounce(inbox: Inbox, msg: NonNullable<ReceivedEvent["message"]>, threadId?: string) {
  if (!isPermanentBounce(msg.subject ?? "", msg.body_text ?? "")) return "temporary";

  const recent = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const outbound = () =>
    admin.from("outreach_messages").select("id, investor_id, to_addr").eq("inbox_id", inbox.id).eq("direction", "outbound").gte("sent_at", recent)
      .order("sent_at", { ascending: false }).limit(1);
  const named = bouncedAddresses(msg.body_text ?? "", inbox.address);
  let original = threadId ? (await outbound().eq("openmail_thread_id", threadId)).data?.[0] : undefined;
  if (!original && named.length) original = (await outbound().in("to_addr", named)).data?.[0];
  if (!original) return "unmatched";

  await admin.from("outreach_messages").update({ status: "bounced" }).eq("id", original.id);
  const investor = original.investor_id ? await loadInvestor(Number(original.investor_id)).catch(() => null) : null;
  const to = (original.to_addr ?? "").toLowerCase();
  if (investor?.email && investor.email.toLowerCase() === to) {
    await suppress(to, "bounce", { investor_id: investor.id, outreach_message_id: original.id });
    await admin.from("scheduled_emails").update({ status: "cancelled", last_error: "Address bounced" })
      .eq("owner_id", inbox.owner_id).eq("investor_id", investor.id).eq("status", "queued");
  }
  return "bounced";
}

const bareAddress = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await req.text();
  const event = JSON.parse(raw) as ReceivedEvent;

  if (!event.inbox_id) return json({ ok: true, ignored: "no inbox" });

  const { data: key } = await admin.rpc("get_inbox_secret", { p_inbox_id: event.inbox_id });
  const valid = key &&
    (await verifySignature(raw, req.headers.get("X-Timestamp") ?? "", req.headers.get("X-Signature") ?? "", key as string));
  if (!valid) return json({ error: "Invalid signature" }, 401);

  const { data: fresh } = await admin.rpc("claim_webhook_event", { p_event_id: event.event_id });
  if (!fresh) return json({ ok: true, duplicate: true });

  const { data: inbox } = await admin.from("inboxes").select("*").eq("openmail_inbox_id", event.inbox_id).maybeSingle();
  if (!inbox) return json({ ok: true, ignored: "unknown inbox" });

  if (event.event === "inbox.suspended" || event.event === "inbox.reactivated") {
    // An inbox retired by a domain switch stays retired.
    if (inbox.status === "retired") return json({ ok: true, ignored: "retired inbox" });
    const suspended = event.event === "inbox.suspended";
    await admin.from("inboxes").update({ status: suspended ? "suspended" : "active" }).eq("id", inbox.id);
    if (suspended) {
      await emailStaff(
        `Centrale: OpenMail suspended ${inbox.address}`,
        "OpenMail stopped this inbox sending. Its queued emails wait until it is reactivated.",
        [`Inbox: ${inbox.address}`, `Reason: ${event.reason ?? "not given"}`, "Reactivation is done by OpenMail support; check the founder's bounces and drafts first."],
        `suspended-${event.event_id}`,
      ).catch((err) => console.error("staff alert failed", err));
    }
    return json({ ok: true });
  }
  if (event.event !== "message.received" || !event.message) return json({ ok: true, ignored: event.event });

  const msg = event.message;
  const from = bareAddress(msg.from);
  if (from === inbox.address.toLowerCase()) return json({ ok: true, ignored: "self" });

  // Not replies: bounces are handled, junk is left in the OpenMail thread only.
  if (msg.category === "bounce") return json({ ok: true, bounce: await handleBounce(inbox, msg, event.thread_id) });
  if (msg.category === "spam" || msg.category === "malicious" || msg.category === "marketing") return json({ ok: true, ignored: msg.category });
  if (msg.category === "automated" && isAutoReply(msg.subject ?? "")) return json({ ok: true, ignored: "auto-reply" });

  // Attribute the reply: same thread as an email we sent, else the sender's address.
  let investorId: number | null = null;
  if (event.thread_id) {
    const { data } = await admin
      .from("outreach_messages")
      .select("investor_id")
      .eq("openmail_thread_id", event.thread_id)
      .not("investor_id", "is", null)
      .limit(1)
      .maybeSingle();
    investorId = data?.investor_id ?? null;
  }
  if (!investorId) investorId = (await findInvestorByEmail(from))?.id ?? null;

  await admin.from("outreach_messages").upsert(
    {
      owner_id: inbox.owner_id,
      investor_id: investorId,
      inbox_id: inbox.id,
      direction: "inbound",
      openmail_message_id: msg.id,
      openmail_thread_id: event.thread_id ?? null,
      from_addr: msg.from,
      to_addr: msg.to,
      subject: msg.subject,
      body: msg.body_text,
      status: "received",
      sent_at: msg.received_at ?? new Date().toISOString(),
    },
    { onConflict: "openmail_message_id", ignoreDuplicates: true },
  );

  // A reply stops any follow-up still waiting to go to this investor.
  if (investorId) {
    await admin
      .from("scheduled_emails")
      .update({ status: "cancelled", last_error: "Investor replied" })
      .eq("owner_id", inbox.owner_id)
      .eq("investor_id", investorId)
      .eq("kind", "follow_up")
      .eq("status", "queued");
  }

  // Into the Unibox, then tag the outcome and tell the founder (investor replies only).
  if (event.thread_id) {
    const convo = await touchConversation({
      owner_id: inbox.owner_id,
      channel: "email",
      external_id: event.thread_id,
      investor_id: investorId,
      title: msg.subject,
      contact_name: msg.from.replace(/<[^>]+>/, "").trim() || from,
      contact_handle: from,
      preview: msg.body_text,
      direction: "inbound",
      at: msg.received_at,
    });
    if (investorId) {
      const investor = await loadInvestor(investorId).catch(() => null);
      const results = await Promise.allSettled([
        tagOutcome({ owner_id: inbox.owner_id, conversation_id: convo, investor_id: investorId, channel: "email", text: msg.body_text }),
        investor
          ? notifyFounder({ owner_id: inbox.owner_id, investor, channel: "email", preview: msg.body_text, conversation_id: convo, idempotencyKey: `notify-${event.event_id}` })
          : Promise.resolve(),
      ]);
      for (const r of results) if (r.status === "rejected") console.error("reply follow-on failed", r.reason);
    }
  }

  return json({ ok: true });
});
