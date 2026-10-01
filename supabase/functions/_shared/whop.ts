// Minimal Whop REST client (api.whop.com/api/v1) and Standard Webhooks signature checks.
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { HttpError, secret } from "./core.ts";

const BASE = "https://api.whop.com/api/v1";

export async function whop<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = await secret("WHOP_API_KEY").catch(() => null);
  if (!key) throw new HttpError(503, "Billing is not set up yet. Add WHOP_API_KEY to Supabase Vault.");
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new HttpError(res.status >= 500 ? 502 : 400, data?.error?.message ?? data?.message ?? `Whop ${res.status}`);
  return data as T;
}

/**
 * Standard Webhooks: base64(HMAC-SHA256(key, "{webhook-id}.{webhook-timestamp}.{body}")) in a
 * "v1,<signature>" header. Whop's helper takes the ws_ secret exactly as given and uses its bytes as
 * the key; the other forms are tried too so a change in how the secret is derived cannot drop events.
 */
export async function verifyWhopSignature(body: string, headers: Headers, webhookSecret: string) {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const header = headers.get("webhook-signature");
  if (!id || !timestamp || !header) return false;
  if (!Number.isFinite(Number(timestamp)) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  const provided = header.split(" ").map((s) => s.split(",")).filter(([v]) => v === "v1").map(([, sig]) => sig);
  const bare = webhookSecret.replace(/^ws_/, "");
  const candidates: Uint8Array<ArrayBuffer>[] = [new TextEncoder().encode(webhookSecret), new TextEncoder().encode(bare)];
  try {
    candidates.push(Uint8Array.from(atob(bare), (c) => c.charCodeAt(0)));
  } catch {
    // Not base64; the raw forms above cover it.
  }

  for (const raw of candidates) {
    const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = encodeBase64(new Uint8Array(await crypto.subtle.sign("HMAC", key, signed)));
    if (provided.some((sig) => timingSafeEqual(sig, expected))) return true;
  }
  return false;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface WhopMembership {
  id: string;
  status: "trialing" | "active" | "past_due" | "completed" | "canceled" | "expired" | "unresolved" | "drafted" | "canceling";
  plan: { id: string } | null;
  user: { id: string; email?: string | null } | null;
  metadata: Record<string, unknown> | null;
  renewal_period_start: string | null;
  renewal_period_end: string | null;
  cancel_at_period_end: boolean;
  manage_url: string | null;
  checkout_configuration_id: string | null;
}
