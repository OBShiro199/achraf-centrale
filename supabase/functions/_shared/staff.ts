// Emails staff (OPS_ALERT_EMAIL, default oliverburt3@gmail.com) from the system inbox.
import { secret } from "./core.ts";
import { escapeHtml } from "./mail.ts";
import { openmail } from "./openmail.ts";

export async function emailStaff(subject: string, intro: string, lines: string[], idempotencyKey: string) {
  const to = (await secret("OPS_ALERT_EMAIL").catch(() => "oliverburt3@gmail.com")).trim();
  const app = await secret("APP_URL").catch(() => "https://www.centralegtm.com");
  await openmail(`/v1/inboxes/${await secret("OPENMAIL_SYSTEM_INBOX_ID")}/send`, {
    idempotencyKey,
    body: {
      to,
      subject,
      body: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#141414">
<p>${escapeHtml(intro)}</p><ul>${lines.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>
<p style="color:#777;font-size:12px">The admin console is at ${escapeHtml(app)}/dashboard/admin.</p></div>`,
    },
  });
}
