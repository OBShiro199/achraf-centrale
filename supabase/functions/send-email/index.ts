// Sends a founder's email to an investor from the founder's OpenMail inbox.
import { admin, HttpError, json, readJson, requireUser, serve } from "../_shared/core.ts";
import { openmail, OpenMailError, type OMSendResult } from "../_shared/openmail.ts";
import { resolveRecipient, toTrackedHtml, withTestNote } from "../_shared/mail.ts";
import { hasPaidPlan } from "../_shared/inbox.ts";
import { investorId, loadInvestor } from "../_shared/investor.ts";

serve(async (req) => {
  const user = await requireUser(req);
  const { investor_id, subject, body, idempotency_key } = await readJson<{
    investor_id?: number | string;
    subject?: string;
    body?: string;
    idempotency_key?: string;
  }>(req);
  if (!subject?.trim() || !body?.trim()) throw new HttpError(400, "Add a subject and a message");
  const id = investorId(investor_id);
  if (!(await hasPaidPlan(user.id))) throw new HttpError(402, "Sending starts when your plan starts, after the 7-day trial.");

  const [{ data: inbox }, investor] = await Promise.all([
    admin.from("inboxes").select("*").eq("owner_id", user.id).eq("status", "active").maybeSingle(),
    loadInvestor(id),
  ]);
  if (!inbox) throw new HttpError(409, "Your inbox is still being set up");

  const outreachId = crypto.randomUUID();
  const { to, test } = await resolveRecipient(investor, user.id);
  let result: OMSendResult;
  try {
    result = await openmail<OMSendResult>(`/v1/inboxes/${inbox.openmail_inbox_id}/send`, {
      body: { to, subject: subject.trim(), body: toTrackedHtml(test ? withTestNote(body, investor) : body, outreachId) },
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
        to_addr: to,
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

  return json({ ok: true, message: row, thread_id: result.threadId, test_mode: test });
});
