// Sends a founder's email to an investor from the founder's OpenMail inbox.
import { admin, HttpError, json, readJson, requireUser, serve } from "../_shared/core.ts";
import { openmail, OpenMailError, type OMSendResult } from "../_shared/openmail.ts";
import { toTrackedHtml } from "../_shared/mail.ts";

serve(async (req) => {
  const user = await requireUser(req);
  const { investor_id, subject, body, idempotency_key } = await readJson<{
    investor_id?: string;
    subject?: string;
    body?: string;
    idempotency_key?: string;
  }>(req);
  if (!investor_id || !subject?.trim() || !body?.trim()) throw new HttpError(400, "Add a subject and a message");

  const [{ data: inbox }, { data: investor }] = await Promise.all([
    admin.from("inboxes").select("*").eq("owner_id", user.id).eq("status", "active").maybeSingle(),
    admin.from("investors").select("id,email,full_name").eq("id", investor_id).single(),
  ]);
  if (!inbox) throw new HttpError(409, "Your inbox is still being set up");
  if (!investor) throw new HttpError(404, "Investor not found");

  const outreachId = crypto.randomUUID();
  let result: OMSendResult;
  try {
    result = await openmail<OMSendResult>(`/v1/inboxes/${inbox.openmail_inbox_id}/send`, {
      body: { to: investor.email, subject: subject.trim(), body: toTrackedHtml(body, outreachId) },
      idempotencyKey: idempotency_key ?? outreachId,
    });
  } catch (err) {
    if (err instanceof OpenMailError && err.status === 429) {
      throw new HttpError(429, "This inbox has hit its sending limit for now. New inboxes send 20 first emails a day while they warm up.");
    }
    throw err;
  }

  const { data: row, error } = await admin
    .from("outreach_messages")
    .upsert(
      {
        id: outreachId,
        owner_id: user.id,
        investor_id: investor.id,
        inbox_id: inbox.id,
        direction: "outbound",
        openmail_message_id: result.messageId,
        openmail_thread_id: result.threadId,
        from_addr: inbox.address,
        to_addr: investor.email,
        subject: subject.trim(),
        body: body.trim(),
        status: result.status,
      },
      { onConflict: "openmail_message_id", ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();
  if (error) throw error;

  // Sending counts as saving: contacted investors stay on the founder's list.
  await admin.from("saved_investors").upsert({ owner_id: user.id, investor_id: investor.id }, { ignoreDuplicates: true });

  return json({ ok: true, message: row, thread_id: result.threadId });
});
