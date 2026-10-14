// Public removal requests from investors in the directory. No login.
// POST { email }: if the address is in the directory, emails it a confirmation link (/remove?t=<token>).
//   Always answers the same, so the form cannot be used to check who is listed.
// POST { token }: confirms. The investor leaves search, profiles, reveals and exports, joins the do-not-email
//   list, and anything queued to them is cancelled.
import { admin, HttpError, json, readJson, secret, serve } from "../_shared/core.ts";
import { escapeHtml } from "../_shared/mail.ts";
import { openmail } from "../_shared/openmail.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Use POST");
  const { email, token } = await readJson<{ email?: string; token?: string }>(req);

  if (token !== undefined) {
    if (!UUID.test(token)) throw new HttpError(400, "This link is not valid");
    const { data, error } = await admin.rpc("confirm_investor_removal", { p_token: token });
    if (error) throw error;
    if (data === null) throw new HttpError(410, "This link has expired. Ask for a new one.");
    return json({ ok: true });
  }

  if (typeof email !== "string" || email.length > 320) throw new HttpError(400, "Enter an email address");
  const { data: t, error } = await admin.rpc("request_investor_removal", { p_email: email });
  if (error) throw error;
  if (t) {
    const app = await secret("APP_URL").catch(() => "https://www.centralegtm.com");
    const link = `${app}/remove?t=${t}`;
    await openmail(`/v1/inboxes/${await secret("OPENMAIL_SYSTEM_INBOX_ID")}/send`, {
      idempotencyKey: `removal-${t}`,
      body: {
        to: email.trim().toLowerCase(),
        subject: "Confirm your removal from Centrale",
        body: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#391c25;max-width:520px;background:#f6f1e8;padding:28px;border-radius:10px">
<p style="font-size:20px;line-height:1.25;font-weight:600;margin:0 0 12px">Remove this address from Centrale</p>
<p style="margin:0 0 20px">Someone asked to remove ${escapeHtml(email.trim())} from the investor directory founders search on Centrale. Confirm below and founders will no longer find you or be able to email you through Centrale.</p>
<p style="margin:0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#391c25;color:#f6f1e8;text-decoration:none;padding:10px 16px;border-radius:6px">Confirm removal</a></p>
<p style="margin:22px 0 0;font-size:12px;color:#9a8d88">The link works for 48 hours. If you did not ask for this, ignore this email and nothing changes.</p>
</div>`,
      },
    });
  }
  return json({ ok: true });
});
