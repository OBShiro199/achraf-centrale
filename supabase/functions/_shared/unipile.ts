// Minimal Unipile REST client (v1). Founders connect their own LinkedIn and WhatsApp accounts through Unipile's
// hosted wizard; Centrale sends from those accounts and Unipile's webhooks bring replies back.
// Vault secrets: UNIPILE_DSN (e.g. api12.unipile.com:14215), UNIPILE_API_KEY, UNIPILE_WEBHOOK_SECRET.
import { HttpError, secret } from "./core.ts";

export class UnipileError extends Error {
  constructor(public status: number, public type: string, message: string) {
    super(message);
  }
}

export async function unipileBase() {
  const dsn = await secret("UNIPILE_DSN").catch(() => null);
  if (!dsn) throw new HttpError(503, "LinkedIn and WhatsApp are not set up yet. Add UNIPILE_DSN and UNIPILE_API_KEY to Supabase Vault.");
  return `https://${dsn.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
}

export async function unipile<T>(path: string, init: { method?: string; json?: unknown; form?: Record<string, string> } = {}): Promise<T> {
  const key = await secret("UNIPILE_API_KEY").catch(() => null);
  if (!key) throw new HttpError(503, "LinkedIn and WhatsApp are not set up yet. Add UNIPILE_API_KEY to Supabase Vault.");
  const headers: Record<string, string> = { "X-API-KEY": key, accept: "application/json" };
  let body: BodyInit | undefined;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(init.form)) fd.append(k, v);
    body = fd;
  }
  const res = await fetch(`${await unipileBase()}${path}`, { method: init.method ?? (body ? "POST" : "GET"), headers, body });
  const text = await res.text();
  let data: Record<string, unknown> & { type?: string; title?: string; detail?: string; message?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (res.ok) throw new UnipileError(502, "bad_response", "Unipile sent an unreadable reply");
  }
  if (!res.ok) throw new UnipileError(res.status, data?.type ?? data?.title ?? "unipile_error", data?.detail ?? data?.message ?? `Unipile ${res.status}`);
  return data as T;
}

/** The last path segment of a LinkedIn profile URL: linkedin.com/in/jane-doe-123/ gives "jane-doe-123". */
export function linkedinIdentifier(url: string | null | undefined) {
  if (!url) return null;
  const m = url.trim().match(/linkedin\.com\/(?:in|pub)\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

/** A phone number as WhatsApp's attendee id: digits with country code, then @s.whatsapp.net. */
export function whatsappId(e164: string) {
  return `${e164.replace(/\D/g, "")}@s.whatsapp.net`;
}

/** Plain-language reasons for Unipile and provider errors a founder can act on. */
export function friendlyUnipileError(err: UnipileError, channel: "linkedin" | "whatsapp") {
  if (err.type.includes("cannot_resend_yet") || err.status === 422 && /invit/i.test(err.message)) {
    return "LinkedIn will not let you invite this person again yet. Try a message once they accept, or another channel.";
  }
  if (err.status === 429) return `${channel === "linkedin" ? "LinkedIn" : "WhatsApp"} is limiting your account for now. Try again tomorrow.`;
  if (/credentials|disconnected|reconnect/i.test(err.type + err.message)) {
    return `Your ${channel === "linkedin" ? "LinkedIn" : "WhatsApp"} account needs reconnecting. Go to Settings, Channels.`;
  }
  if (/invalid_recipient|not_found|invalid_attendee/i.test(err.type)) {
    return channel === "whatsapp" ? "This number is not on WhatsApp." : "We could not find this person on LinkedIn.";
  }
  return err.message;
}
