import { secret, SUPABASE_URL } from "./core.ts";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text to simple HTML paragraphs, with an open-tracking pixel appended. */
export function toTrackedHtml(text: string, outreachId: string) {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const pixel = `<img src="${SUPABASE_URL}/functions/v1/track-open?m=${outreachId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`;
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#141414">${paragraphs}${pixel}</div>`;
}

export { escapeHtml };

/** Every test-mode email goes here. Override with the Vault secret OUTREACH_TEST_RECIPIENT. */
const DEFAULT_TEST_RECIPIENT = "oliverburt3+centraletest@gmail.com";

/**
 * Test mode. Investors synced from the real directory only receive email once the Vault secret
 * OUTREACH_LIVE is "true". Until then every send goes to one test inbox with a note saying who it
 * was for, so testing can never reach a real investor.
 */
export async function resolveRecipient(investor: { email: string; full_name: string; source?: string | null }, _ownerId: string) {
  const to = (await secret("OUTREACH_TEST_RECIPIENT").catch(() => DEFAULT_TEST_RECIPIENT)).trim() || DEFAULT_TEST_RECIPIENT;
  // The reply-testing contact already points at the test inbox.
  if (investor.source === "test") return { to: investor.email, test: false };
  // Old demo investors have made-up addresses: always the test inbox.
  if (investor.source !== "contacts") return { to, test: true };
  const live = await secret("OUTREACH_LIVE").then((v) => v.trim().toLowerCase() === "true").catch(() => false);
  return live ? { to: investor.email, test: false } : { to, test: true };
}

export function withTestNote(body: string, investor: { email: string; full_name: string }) {
  return `Test mode: this email is addressed to ${investor.full_name} <${investor.email}>. Centrale sent it to the test inbox instead, because live sending to real investors is off.\n\n${body}`;
}
