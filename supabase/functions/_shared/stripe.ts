// Minimal Stripe REST client: form-encoded requests and webhook signature checks, no SDK.
import { HttpError, secret } from "./core.ts";

const BASE = "https://api.stripe.com/v1";

/** Flattens nested objects into Stripe's form keys: { a: { b: 1 } } -> a[b]=1. */
function form(data: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === "object" ? form(item, `${key}[${i}]`, out) : out.append(`${key}[]`, String(item))));
    else if (typeof v === "object") form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function key() {
  const k = await secret("STRIPE_SECRET_KEY").catch(() => null);
  if (!k) throw new HttpError(503, "Billing is not set up yet. Add STRIPE_SECRET_KEY to Supabase Vault.");
  return k;
}

export async function stripe<T>(path: string, init: { method?: "GET" | "POST"; body?: Record<string, unknown>; idempotencyKey?: string } = {}): Promise<T> {
  const method = init.method ?? (init.body ? "POST" : "GET");
  const qs = method === "GET" && init.body ? `?${form(init.body)}` : "";
  const res = await fetch(`${BASE}${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${await key()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: method === "POST" && init.body ? form(init.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(res.status >= 500 ? 502 : 400, data?.error?.message ?? `Stripe ${res.status}`);
  return data as T;
}

/** Verifies a Stripe-Signature header: HMAC-SHA256 of "{t}.{body}" with the endpoint secret, 5 minute tolerance. */
export async function verifyStripeSignature(body: string, header: string | null, endpointSecret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]).filter((p) => p.length === 2));
  const t = parts.t;
  const signatures = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !signatures.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(endpointSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  for (const sig of signatures) {
    const bytes = sig.match(/.{1,2}/g)?.map((b) => parseInt(b, 16));
    if (!bytes || bytes.some(Number.isNaN)) continue;
    // crypto.subtle.verify compares in constant time.
    if (await crypto.subtle.verify("HMAC", cryptoKey, new Uint8Array(bytes), new TextEncoder().encode(`${t}.${body}`))) return true;
  }
  return false;
}

export interface StripePrice {
  id: string;
  lookup_key: string | null;
  unit_amount: number | null;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: "trialing" | "active" | "past_due" | "unpaid" | "canceled" | "incomplete" | "incomplete_expired" | "paused";
  cancel_at_period_end: boolean;
  current_period_start?: number;
  current_period_end?: number;
  trial_end: number | null;
  metadata: Record<string, string>;
  items: { data: { price: StripePrice; current_period_start?: number; current_period_end?: number }[] };
}
