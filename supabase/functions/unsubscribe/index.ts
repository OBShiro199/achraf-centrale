// Public unsubscribe endpoint behind the link in every cold email. POST { m: outreach message id }.
// The id is an unguessable uuid from that email, so it identifies the recipient without a login.
// Adds the investor's address to the global do-not-email list and cancels anything still queued to them.
import { admin, HttpError, json, readJson, serve } from "../_shared/core.ts";
import { suppress } from "../_shared/mail.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Use POST");
  const { m } = await readJson<{ m?: string }>(req);
  if (!m || !UUID.test(m)) throw new HttpError(400, "This unsubscribe link is not valid");

  const { data: msg } = await admin.from("outreach_messages").select("id, investor_id, owner_id").eq("id", m).maybeSingle();
  if (!msg?.investor_id) {
    // Unknown or already removed: answer the same way so the link reveals nothing.
    return json({ ok: true });
  }
  const { data: investor } = await admin.from("investors_achraf").select("id, email").eq("id", msg.investor_id).maybeSingle();
  if (investor?.email) {
    await suppress(investor.email, "unsubscribe", { investor_id: investor.id, outreach_message_id: msg.id });
    await admin
      .from("scheduled_emails")
      .update({ status: "cancelled", last_error: "Unsubscribed" })
      .eq("investor_id", investor.id)
      .eq("status", "queued");
  }
  return json({ ok: true });
});
