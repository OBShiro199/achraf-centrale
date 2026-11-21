// Minimal Telnyx REST client (api.telnyx.com/v2) and webhook signature check.
// Vault secrets: TELNYX_API_KEY, TELNYX_PUBLIC_KEY (webhook signing key from Mission Control, base64),
// TELNYX_CONNECTION_ID (the credential connection browsers dial through, created by scripts/setup-integrations.mjs).
import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { HttpError, secret } from "./core.ts";

const BASE = "https://api.telnyx.com/v2";

export class TelnyxError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function telnyxKey() {
  const key = await secret("TELNYX_API_KEY").catch(() => null);
  if (!key) throw new HttpError(503, "Calling is not set up yet. Add TELNYX_API_KEY to Supabase Vault.");
  return key;
}

export async function telnyx<T>(path: string, init: { method?: string; body?: unknown; text?: boolean } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${await telnyxKey()}`, "Content-Type": "application/json", accept: init.text ? "text/plain" : "application/json" },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let code = "telnyx_error", message = `Telnyx ${res.status}`;
    try {
      const e = JSON.parse(text)?.errors?.[0];
      code = e?.code ?? code;
      message = e?.detail ?? e?.title ?? message;
    } catch { /* not JSON */ }
    throw new TelnyxError(res.status, String(code), message);
  }
  if (init.text) return text as T;
  return (text ? JSON.parse(text) : {}) as T;
}

/** Telnyx signs `${timestamp}|${body}` with Ed25519; the key and signature are base64. Rejects anything over 5 minutes old. */
export async function verifyTelnyxSignature(body: string, headers: Headers) {
  const sig = headers.get("telnyx-signature-ed25519");
  const ts = headers.get("telnyx-timestamp");
  const pub = await secret("TELNYX_PUBLIC_KEY").catch(() => null);
  if (!sig || !ts || !pub) return false;
  if (!Number.isFinite(Number(ts)) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  try {
    const key = await crypto.subtle.importKey("raw", decodeBase64(pub), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, decodeBase64(sig), new TextEncoder().encode(`${ts}|${body}`));
  } catch {
    return false;
  }
}

/** Base64 of JSON, for the client_state Telnyx echoes back on every event of a call. */
export const clientState = (v: unknown) => btoa(JSON.stringify(v));
export function readClientState<T>(v: string | null | undefined): T | null {
  if (!v) return null;
  try {
    return JSON.parse(atob(v)) as T;
  } catch {
    return null;
  }
}
