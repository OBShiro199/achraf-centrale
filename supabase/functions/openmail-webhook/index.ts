// Receives OpenMail events for founder inboxes: records investor replies and
// emails the founder a heads-up from the system inbox.
import { admin, json, secret, serve } from "../_shared/core.ts";
import { openmail, verifySignature } from "../_shared/openmail.ts";
import { escapeHtml } from "../_shared/mail.ts";

interface ReceivedEvent {
  event: string;
  event_id: string;
  inbox_id: string | null;
  thread_id?: string;
  message?: { id: string; from: string; to: string; subject: string; body_text: string; received_at: string };
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
    await admin.from("inboxes").update({ status: event.event === "inbox.suspended" ? "suspended" : "active" }).eq("id", inbox.id);
    return json({ ok: true });
  }
  if (event.event !== "message.received" || !event.message) return json({ ok: true, ignored: event.event });

  const msg = event.message;
  const from = bareAddress(msg.from);
  if (from === inbox.address.toLowerCase()) return json({ ok: true, ignored: "self" });

  // Attribute the reply: same thread as an email we sent, else the sender's address.
  let investorId: string | null = null;
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
  if (!investorId) {
    const { data } = await admin.from("investors").select("id").ilike("email", from).limit(1).maybeSingle();
    investorId = data?.id ?? null;
  }

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

  // Heads-up email to the founder, only for investor replies.
  if (investorId) {
    try {
      const [{ data: investor }, { data: profile }] = await Promise.all([
        admin.from("investors").select("full_name,firm").eq("id", investorId).single(),
        admin.from("profiles").select("email,first_name").eq("id", inbox.owner_id).single(),
      ]);
      const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:3000";
      if (investor && profile?.email) {
        const preview = escapeHtml(msg.body_text.split(/\n\s*\n/)[0].slice(0, 280));
        await openmail(`/v1/inboxes/${await secret("OPENMAIL_SYSTEM_INBOX_ID")}/send`, {
          idempotencyKey: `notify-${event.event_id}`,
          body: {
            to: profile.email,
            subject: `${investor.full_name} replied`,
            body: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#391c25;max-width:520px;background:#f6f1e8;padding:28px;border-radius:10px">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>
<td style="padding:0 3px 0 0"><div style="width:10px;height:10px;background:#d94a38;border-radius:3px"></div></td>
<td style="padding:0 3px"><div style="width:10px;height:10px;background:#391c25;border-radius:3px"></div></td>
<td style="padding:0 3px"><div style="width:10px;height:10px;background:#d94a38;border-radius:3px"></div></td>
<td style="padding:0 3px"><div style="width:10px;height:10px;background:#e8a193;border-radius:3px"></div></td>
<td style="padding:0 0 0 10px;font-weight:600;font-size:15px;color:#391c25">centrale</td></tr></table>
<p style="font-size:22px;line-height:1.25;font-weight:600;margin:0 0 12px">${escapeHtml(investor.full_name)} from ${escapeHtml(investor.firm)} replied.</p>
<p style="margin:0 0 20px;color:#6f5f62;border-left:3px solid #d94a38;padding-left:12px">${preview}</p>
<p style="margin:0"><a href="${appUrl}/dashboard/inbox?thread=${event.thread_id ?? ""}" style="display:inline-block;background:#391c25;color:#f6f1e8;text-decoration:none;padding:10px 16px;border-radius:6px">Open the thread</a></p>
<p style="margin:22px 0 0;font-size:12px;color:#9a8d88">Your next round starts here.</p>
</div>`,
          },
        });
      }
    } catch (err) {
      console.error("founder notification failed", err);
    }
  }

  return json({ ok: true });
});
