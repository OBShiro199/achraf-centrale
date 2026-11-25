// Buying a sending domain for a founder through Porkbun (api.porkbun.com/api/json/v3).
// Purchases spend prepaid Porkbun credit, so keep the account topped up (auto top-up on the API settings page).
// Vault secrets: PORKBUN_API_KEY, PORKBUN_SECRET_KEY; DOMAIN_MAX_USD caps the first-year price (default 13).
import { HttpError, secret } from "./core.ts";

const BASE = "https://api.porkbun.com/api/json/v3";

/**
 * TLDs we will buy. Cheap TLDs such as .xyz, .online, .site, .click and .top are on spam filters' watch lists,
 * which would sink a founder's first emails to investors, so the list is short and trusted.
 */
export const SENDING_TLDS = ["com", "co", "io", "org"] as const;

async function keys() {
  const [apikey, secretapikey] = await Promise.all([secret("PORKBUN_API_KEY").catch(() => null), secret("PORKBUN_SECRET_KEY").catch(() => null)]);
  if (!apikey || !secretapikey) throw new HttpError(503, "Domain buying is not set up yet. Add PORKBUN_API_KEY and PORKBUN_SECRET_KEY to Supabase Vault.");
  return { apikey, secretapikey };
}

export async function maxDomainUsd() {
  return Number(await secret("DOMAIN_MAX_USD").catch(() => "")) || 13;
}

async function porkbun<T>(path: string, body: Record<string, unknown> = {}, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body: JSON.stringify({ ...(await keys()), ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== "SUCCESS") throw new HttpError(res.status >= 500 ? 502 : 422, data.message ?? `Porkbun ${res.status}`);
  return data as T;
}

/** Name ideas from a company name: acme.com, getacme.com, acmehq.com, tryacme.com, then the other TLDs. */
export function domainCandidates(companyName: string) {
  const base = companyName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "").slice(0, 20);
  if (base.length < 2) return [];
  const stems = [base, `get${base}`, `${base}hq`, `try${base}`, `meet${base}`, `${base}team`];
  const out: string[] = [];
  for (const stem of stems) out.push(`${stem}.com`);
  for (const tld of SENDING_TLDS.slice(1)) out.push(`${base}.${tld}`, `${base}hq.${tld}`);
  return out.slice(0, 25);
}

export interface DomainOption {
  domain: string;
  price_usd: number;
  renewal_usd: number | null;
}

/** Available names under the price cap, cheapest .com first. */
export async function availableDomains(candidates: string[]): Promise<DomainOption[]> {
  if (!candidates.length) return [];
  const cap = await maxDomainUsd();
  const res = await porkbun<{ domains: Record<string, { avail: string; price: string; additional?: { renewal?: { price?: string } } }> }>("/domain/checkDomain", { domains: candidates });
  return candidates
    .map((d) => ({ d, r: res.domains?.[d] }))
    .filter(({ r }) => r?.avail === "yes" && Number(r.price) > 0 && Number(r.price) <= cap)
    .map(({ d, r }) => ({ domain: d, price_usd: Number(r!.price), renewal_usd: r!.additional?.renewal?.price ? Number(r!.additional.renewal.price) : null }));
}

/** Registers the domain for a year from Porkbun credit. The quote must be current: Porkbun refuses a stale price. */
export async function registerDomain(domain: string, priceUsd: number, idempotencyKey: string) {
  const cap = await maxDomainUsd();
  if (priceUsd > cap) throw new HttpError(422, `That domain costs more than $${cap}.`);
  await porkbun(`/domain/create/${domain}`, { cost: Math.round(priceUsd * 100), agreeToTerms: "yes" }, idempotencyKey);
}

/** Adds one DNS record. Porkbun wants the subdomain only ("" for the root, "omail._domainkey" for DKIM). */
export async function addDnsRecord(domain: string, rec: { type: string; name: string; content: string; prio?: number | null }) {
  const name = rec.name === "@" || rec.name === domain ? "" : rec.name.replace(new RegExp(`\\.?${domain.replace(/\./g, "\\.")}\\.?$`), "");
  await porkbun(`/dns/create/${domain}`, { type: rec.type, name, content: rec.content, ttl: 600, ...(rec.prio != null ? { prio: rec.prio } : {}) });
}
