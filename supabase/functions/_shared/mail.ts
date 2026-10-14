import { admin, HttpError, secret, SUPABASE_URL } from "./core.ts";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Plain text to simple HTML paragraphs, with an open-tracking pixel appended. `footer` is trusted HTML added at
 * the end. When the founder's booking link appears in the text it becomes a link through the click counter.
 */
export function toTrackedHtml(text: string, outreachId: string, footer = "", calendarUrl?: string | null) {
  const calendar = calendarUrl ? escapeHtml(calendarUrl) : null;
  const tracked = `${SUPABASE_URL}/functions/v1/meeting-link?m=${outreachId}`;
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) => {
      let html = escapeHtml(p).replace(/\n/g, "<br>");
      if (calendar) html = html.split(calendar).join(`<a href="${tracked}" style="color:#141414">${calendar}</a>`);
      return `<p style="margin:0 0 14px">${html}</p>`;
    })
    .join("");
  const pixel = `<img src="${SUPABASE_URL}/functions/v1/track-open?m=${outreachId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`;
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#141414">${paragraphs}${footer}${pixel}</div>`;
}

/**
 * The opt-out line on cold emails (first emails and follow-ups, not replies in a conversation): an unsubscribe
 * link keyed by this email's outreach id, plus the company postal address once the Vault secret
 * COMPANY_POSTAL_ADDRESS is set (UK PECR and CAN-SPAM expect both on commercial email).
 */
export async function optOutFooter(outreachId: string) {
  const app = (await secret("APP_URL").catch(() => "https://www.centralegtm.com")).replace(/\/$/, "");
  const address = (await secret("COMPANY_POSTAL_ADDRESS").catch(() => "")).trim();
  const link = `${app}/unsubscribe?m=${encodeURIComponent(outreachId)}`;
  return `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#8a8a8a">If you would rather not hear from me again, <a href="${escapeHtml(link)}" style="color:#8a8a8a">unsubscribe</a>.${address ? `<br>${escapeHtml(address)}` : ""}</p>`;
}

/** True when this address must never be emailed again (unsubscribed, bounced, complained or removed by hand). */
export async function isSuppressed(email: string | null | undefined) {
  if (!email) return false;
  const { data } = await admin.from("email_suppressions").select("email").eq("email", email.trim().toLowerCase()).maybeSingle();
  return Boolean(data);
}

/** Records an address OpenMail refused as bounced or complained about, or one that unsubscribed. */
export async function suppress(email: string, reason: "unsubscribe" | "bounce" | "complaint" | "manual", ids: { investor_id?: number | null; outreach_message_id?: string | null } = {}) {
  await admin
    .from("email_suppressions")
    .upsert({ email: email.trim().toLowerCase(), reason, investor_id: ids.investor_id ?? null, outreach_message_id: ids.outreach_message_id ?? null }, {
      onConflict: "email",
      ignoreDuplicates: true,
    });
}

export { escapeHtml };

/** Every test-mode email goes here. Override with the Vault secret OUTREACH_TEST_RECIPIENT. */
const DEFAULT_TEST_RECIPIENT = "oliverburt3@gmail.com";

/**
 * Test mode. Directory investors only receive email once the Vault secret OUTREACH_LIVE is "true".
 * Until then every send goes to one test inbox with a note saying who it was for, so testing can
 * never reach a real investor.
 */
export async function resolveRecipient(investor: { email: string | null; full_name: string }, _ownerId: string) {
  if (!investor.email) throw new HttpError(422, `We do not have an email address for ${investor.full_name}.`);
  const to = (await secret("OUTREACH_TEST_RECIPIENT").catch(() => DEFAULT_TEST_RECIPIENT)).trim() || DEFAULT_TEST_RECIPIENT;
  const live = await secret("OUTREACH_LIVE").then((v) => v.trim().toLowerCase() === "true").catch(() => false);
  return live ? { to: investor.email, test: false } : { to, test: true };
}

export function withTestNote(body: string, investor: { email: string | null; full_name: string }) {
  return `Test mode: this email is addressed to ${investor.full_name} <${investor.email}>. Centrale sent it to the test inbox instead, because live sending to real investors is off.\n\n${body}`;
}
