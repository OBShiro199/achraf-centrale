import { secret } from "./core.ts";

const BASE = "https://api.openmail.sh";

export class OpenMailError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function openmail<T>(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await secret("OPENMAIL_API_KEY")}`,
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new OpenMailError(res.status, data.error ?? "openmail_error", data.message ?? `OpenMail ${res.status}`);
  }
  return data as T;
}

export interface OMInbox {
  id: string;
  podId?: string;
  address: string;
  displayName?: string | null;
  webhookSecret?: string | null;
  createdAt: string;
}

export interface OMThread {
  id: string;
  subject: string;
  isRead: boolean;
  lastMessageAt: string;
  createdAt: string;
  messageCount: number;
}

export interface OMMessage {
  id: string;
  threadId: string;
  direction: "inbound" | "outbound";
  fromAddr: string;
  toAddr: string;
  subject: string;
  bodyText: string;
  status: string;
  createdAt: string;
}

export interface OMSendResult {
  messageId: string;
  threadId: string;
  status: "pending" | "sent" | "failed";
}

/** Verifies an OpenMail webhook: HMAC-SHA256(secret, "{timestamp}.{body}"), hex. */
export async function verifySignature(body: string, timestamp: string, signature: string, key: string) {
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sig = signature.match(/.{1,2}/g)?.map((b) => parseInt(b, 16));
  if (!sig || sig.some(Number.isNaN)) return false;
  // crypto.subtle.verify is constant time.
  return crypto.subtle.verify("HMAC", cryptoKey, new Uint8Array(sig), new TextEncoder().encode(`${timestamp}.${body}`));
}
