// The investor directory's filter model, shared by the AI search and its sanitiser.
// Keep in sync with src/lib/lead-filters.ts (the filter bar) and private.lead_query_from (the database).
// A search is one flat object: keys are filter names, filters stack with AND, values inside one filter are OR.

export type FilterKind = "pills" | "multi" | "bool" | "range";

export interface FilterSpec {
  key: string;
  kind: FilterKind;
  /** multi: where the allowed values come from (lead_facets), or a fixed list. */
  facet?: string;
  values?: string[];
  /** range: allowed numeric bounds. */
  min?: number;
  max?: number;
  /** What the AI is told the filter means. */
  about: string;
}

export const STATUS_VALUES = ["new", "queued", "contacted", "opened", "replied", "no_reply"];

export const FILTER_SPECS: FilterSpec[] = [
  { key: "titles", kind: "pills", about: "Job title contains any of these words, e.g. partner, managing director, angel investor, principal. Include common variants (managing partner, general partner)." },
  { key: "titlesNot", kind: "pills", about: "Job title contains none of these, e.g. analyst, intern, investor relations." },
  { key: "roles", kind: "multi", facet: "role", about: "Role derived from the title: partner (partners, GPs, managing directors, founders), principal (directors, VPs), associate (associates, analysts), angel, venture_partner (venture partners, scouts, advisers), operating (platform and operating teams), investor_relations, lp, other." },
  { key: "names", kind: "pills", about: "Person's name contains this text. Only when the user names a person." },
  { key: "firms", kind: "pills", about: "Firm name contains this text, e.g. sequoia, capital, ventures. Only when the user names firms or a word in firm names." },
  { key: "firmsNot", kind: "pills", about: "Firm name contains none of these." },
  { key: "industries", kind: "multi", facet: "industry", about: "The firm's LinkedIn industry, exactly as listed. Most investors are 'Venture Capital and Private Equity Principals' or 'Investment Management'." },
  { key: "industriesNot", kind: "multi", facet: "industry", about: "Exclude these firm industries, e.g. 'Investment Banking'." },
  { key: "sizes", kind: "multi", facet: "size", about: "Firm headcount band. Use only when the user mentions firm size (small fund, boutique = 1-10 or 11-50; large firm = 201-500 and above)." },
  { key: "foundedMin", kind: "range", min: 1900, max: 2100, about: "Firm founded in or after this year." },
  { key: "foundedMax", kind: "range", min: 1900, max: 2100, about: "Firm founded in or before this year." },
  { key: "stages", kind: "multi", facet: "stage", about: "Stages or types the investor backs: Pre-Seed, Seed, Angel, Accelerator, Early Stage, Series A/B/C/D+, Growth, Late Stage, Buyout/PE, Fund of Funds, Venture Debt. Matches any." },
  { key: "stagesNot", kind: "multi", facet: "stage", about: "Exclude investors tagged with these, e.g. Buyout/PE when the user wants venture investors only." },
  { key: "focus", kind: "multi", facet: "focus", about: "Sector focus tags, e.g. FinTech, HealthTech, AI/ML, Climate/Energy. Matches any." },
  { key: "focusNot", kind: "multi", facet: "focus", about: "Exclude investors with these sector tags." },
  { key: "specialties", kind: "pills", about: "The firm's listed specialties contain any of these words, e.g. payments, insurtech, b2b saas, deep tech. Use for niches the focus tags do not cover." },
  { key: "about", kind: "pills", about: "The firm's description contains any of these words or phrases, e.g. 'pre-seed', 'female founders', 'impact'. Use for thesis or values the other filters do not cover." },
  { key: "regions", kind: "multi", facet: "region", about: "Region: UK, Europe, US, Canada, Middle East, Asia, Oceania, Latin America, Africa. Location filters (regions, countries, states, cities) combine with OR." },
  { key: "countries", kind: "multi", facet: "country", about: "Country, as listed (e.g. United Kingdom, United States, Germany)." },
  { key: "countriesNot", kind: "multi", facet: "country", about: "Exclude these countries." },
  { key: "states", kind: "multi", facet: "state", about: "US state or region code as listed (e.g. CA, NY, MA, ENG)." },
  { key: "cities", kind: "pills", about: "City contains this text, e.g. London, San Francisco, New York." },
  { key: "hasEmail", kind: "bool", about: "Has an email address on file. Set yes whenever the user wants to email investors." },
  { key: "hasPhone", kind: "bool", about: "Has a phone number on file." },
  { key: "hasLinkedin", kind: "bool", about: "Has a LinkedIn profile on file." },
  { key: "status", kind: "multi", values: STATUS_VALUES, about: "The founder's own outreach status: new (never contacted), queued, contacted, opened, replied, no_reply." },
  { key: "saved", kind: "bool", about: "Only investors the founder saved (yes) or not saved (no)." },
  { key: "picks", kind: "bool", about: "Only Claude's shortlisted picks for this founder." },
  { key: "minScore", kind: "range", min: 0, max: 100, about: "Minimum fit score against the founder's own profile (0 to 100). Use 60 for 'strong fits', 40 for 'good fits'." },
  { key: "onePerFirm", kind: "bool", about: "Show one person per firm (the best fit). Use when the user asks for firms or funds rather than people." },
];

export const SPEC_BY_KEY = new Map(FILTER_SPECS.map((s) => [s.key, s]));

export type Filters = Record<string, string[] | number | boolean>;
export type Facets = Record<string, { value: string; n: number }[]>;

const LIST_MAX = 20;
const VALUE_MAX = 80;

/** Turns the AI's { field, values } pairs into a filter object. Unknown fields are dropped; repeated list fields merge. */
export function fromEntries(entries: { field: string; values: string[] }[]): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  for (const e of entries ?? []) {
    const spec = SPEC_BY_KEY.get(e?.field);
    if (!spec || !Array.isArray(e.values)) continue;
    const vals = e.values.filter((v) => typeof v === "string").map((v) => v.trim()).filter(Boolean);
    if (!vals.length) continue;
    if (spec.kind === "bool") {
      const v = vals[0].toLowerCase();
      if (["yes", "true"].includes(v)) out[spec.key] = true;
      else if (["no", "false"].includes(v)) out[spec.key] = false;
    } else if (spec.kind === "range") {
      const n = Number(vals[0].replace(/[,£$€\s]/g, ""));
      if (Number.isFinite(n)) out[spec.key] = n;
    } else {
      out[spec.key] = [...((out[spec.key] as string[] | undefined) ?? []), ...vals];
    }
  }
  return { ...out };
}

/**
 * The security boundary for AI output: only whitelisted keys with the right type survive, enum values are
 * matched case-insensitively to their real spelling (invented ones are dropped), lists are capped, numbers
 * clamped, and a min and max given back to front are swapped.
 */
export function sanitize(raw: Record<string, unknown>, facets: Facets): Filters {
  const out: Filters = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    const spec = SPEC_BY_KEY.get(key);
    if (!spec) continue;
    if (spec.kind === "bool") {
      if (typeof value === "boolean") out[key] = value;
      continue;
    }
    if (spec.kind === "range") {
      if (typeof value === "number" && Number.isFinite(value)) out[key] = Math.round(Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, value)));
      continue;
    }
    if (!Array.isArray(value)) continue;
    const strings = value.filter((v): v is string => typeof v === "string").map((v) => v.trim().slice(0, VALUE_MAX)).filter(Boolean);
    let kept: string[];
    if (spec.kind === "multi") {
      const allowed = spec.values ?? (facets[spec.facet ?? ""] ?? []).map((f) => f.value);
      const byLower = new Map(allowed.map((v) => [v.toLowerCase(), v]));
      kept = strings.map((v) => byLower.get(v.toLowerCase())).filter((v): v is string => Boolean(v));
    } else {
      kept = strings;
    }
    kept = [...new Set(kept)].slice(0, LIST_MAX);
    if (kept.length) out[key] = kept;
  }
  if (typeof out.foundedMin === "number" && typeof out.foundedMax === "number" && out.foundedMin > out.foundedMax) {
    [out.foundedMin, out.foundedMax] = [out.foundedMax, out.foundedMin];
  }
  return out;
}
