// Minimal Unipile REST client (API v2, https://api.unipile.com). Founders connect their own LinkedIn and WhatsApp
// accounts through Unipile's hosted page; Centrale sends from those accounts and Unipile's webhooks bring replies back.
// Vault secrets: UNIPILE_API_KEY (an application Service Key: it also manages webhooks) and UNIPILE_WEBHOOK_SECRET
// (the signing secret Unipile returns when the webhook endpoint is created; see docs/HANDOVER.md).
import { HttpError, secret } from "./core.ts";

const BASE = "https://api.unipile.com";

export class UnipileError extends Error {
  constructor(public status: number, public type: string, message: string, public detail = "") {
    super(message);
  }
}

/**
 * True once the key is in Vault and the webhook endpoint exists (its signing secret is stored when it is created,
 * which needs an active Unipile subscription). Until then the app shows LinkedIn and WhatsApp as coming soon, so
 * founders never see a Connect button that cannot work.
 */
export async function unipileConfigured() {
  const [key, hook] = await Promise.all([secret("UNIPILE_API_KEY").catch(() => ""), secret("UNIPILE_WEBHOOK_SECRET").catch(() => "")]);
  return Boolean(key?.trim() && hook?.trim());
}

export async function unipile<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const key = await secret("UNIPILE_API_KEY").catch(() => null);
  if (!key?.trim()) throw new HttpError(503, "LinkedIn and WhatsApp are not set up yet. Add UNIPILE_API_KEY to Supabase Vault.");
  const headers: Record<string, string> = { "X-API-KEY": key, accept: "application/json" };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const text = await res.text();
  let data: Record<string, unknown> & { type?: string; title?: string; detail?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (res.ok) throw new UnipileError(502, "bad_response", "Unipile sent an unreadable reply");
  }
  if (!res.ok) {
    throw new UnipileError(res.status, String(data.type ?? "unipile_error"), String(data.title ?? `Unipile ${res.status}`), String(data.detail ?? ""));
  }
  return data as T;
}

/** v2 send endpoints answer a message id as a string, an array or null. */
export function firstId(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

/**
 * Unipile signs each webhook: header `unipile-signature: t=<unix seconds>,v0=<hex>`, where
 * v0 = HMAC-SHA256(secret, `${t}.${rawBody}`). Rejects anything older than 5 minutes.
 */
export async function verifyUnipileSignature(rawBody: string, header: string | null, key: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!parts.v0 || !Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const hmac = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", hmac, new TextEncoder().encode(`${parts.t}.${rawBody}`)));
  const expected = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== parts.v0.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.v0.charCodeAt(i);
  return diff === 0;
}

/** The last path segment of a LinkedIn profile URL: linkedin.com/in/jane-doe-123/ gives "jane-doe-123". */
export function linkedinIdentifier(url: string | null | undefined) {
  if (!url) return null;
  const m = url.trim().match(/linkedin\.com\/(?:in|pub)\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

/** A phone number as WhatsApp's user id: digits with country code, then @s.whatsapp.net. */
export function whatsappId(e164: string) {
  return `${e164.replace(/\D/g, "")}@s.whatsapp.net`;
}

/** Plain-language reasons for Unipile and provider errors a founder can act on. */
export function friendlyUnipileError(err: UnipileError, channel: "linkedin" | "whatsapp") {
  const name = channel === "linkedin" ? "LinkedIn" : "WhatsApp";
  const all = `${err.type} ${err.message} ${err.detail}`;
  if (/cannot_resend_yet|already.*invit/i.test(all)) {
    return "LinkedIn will not let you invite this person again yet. Try a message once they accept, or another channel.";
  }
  if (err.status === 429) return `${name} is limiting your account for now. Try again tomorrow.`;
  if (/invalid_authorization|disconnected|expired_authorization|account_mismatch/i.test(all) || err.status === 401) {
    return `Your ${name} account needs reconnecting. Go to Settings, Channels.`;
  }
  if (/resource_not_found/i.test(all) || err.status === 404) {
    return channel === "whatsapp" ? "This number is not on WhatsApp." : "We could not find this person on LinkedIn.";
  }
  if (/inactive_subscription/i.test(all)) return `${name} messaging is paused on our side. We have been told; try again later.`;
  return err.detail || err.message;
}
