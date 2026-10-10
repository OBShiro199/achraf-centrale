// Investors come from public.investors_achraf (the directory). Ids are bigint row ids.
import { admin, HttpError } from "./core.ts";

export interface Investor {
  id: number;
  email: string | null;
  full_name: string;
  first_name: string | null;
  title: string | null;
  headline: string | null;
  firm: string;
  firm_domain: string | null;
  firm_about: string | null;
  firm_industry: string | null;
  specialties: string[];
  stages: string[];
  focus: string[];
  city: string | null;
  country: string | null;
}

const COLUMNS = "id, email, full_name, first_name, title, headline, firm, firm_domain, firm_about, firm_industry, specialties, stage, focus, city, country";

// deno-lint-ignore no-explicit-any
function shape(r: any): Investor {
  return {
    id: Number(r.id),
    email: r.email?.trim() || null,
    full_name: r.full_name?.trim() || "there",
    first_name: r.first_name?.trim() || null,
    title: r.title ?? null,
    headline: r.headline ?? null,
    firm: r.firm?.trim() || "their firm",
    firm_domain: r.firm_domain ?? null,
    firm_about: r.firm_about ?? null,
    firm_industry: r.firm_industry ?? null,
    specialties: String(r.specialties ?? "").split(";").map((s: string) => s.trim()).filter(Boolean),
    stages: Array.isArray(r.stage) ? r.stage : [],
    focus: Array.isArray(r.focus) ? r.focus : [],
    city: r.city ?? null,
    country: r.country ?? null,
  };
}

/** A directory id from a request body: a positive integer, as a number or a string. */
export function investorId(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,12}$/.test(v) ? Number(v) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, "Pick an investor");
  return n;
}

export async function loadInvestor(id: number): Promise<Investor> {
  const { data, error } = await admin.from("investors_achraf").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "This investor is no longer in the directory");
  return shape(data);
}

export async function findInvestorByEmail(email: string): Promise<Investor | null> {
  const { data } = await admin.from("investors_achraf").select(COLUMNS).ilike("email", email).limit(1).maybeSingle();
  return data ? shape(data) : null;
}
