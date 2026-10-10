// The investor directory's filters. One definition per filter drives the Add filter menu, the chip editors,
// the chip text and what is sent to the database. Keep the keys in sync with
// supabase/functions/_shared/lead-filters.ts (the AI whitelist) and private.lead_query_from (the database).
// A search is one flat object: filters stack with AND, values inside one filter are OR, and location filters
// (regions, countries, states, cities) together count as one OR group.

import { REGIONS, ROLES } from "@/lib/taxonomy";

export type FilterKind = "pills" | "multi" | "bool" | "range";

export interface FilterDef {
  /** JSON key. For ranges, `range.min` and `range.max` are the keys; `key` is a UI id. */
  key: string;
  label: string;
  group: "Person" | "Firm" | "Thesis" | "Location" | "Contact data" | "Your activity";
  kind: FilterKind;
  /** multi: facet name in lead_facets, or fixed `options`. */
  facet?: string;
  options?: { value: string; label: string }[];
  /** multi: show options in this order instead of by count. */
  order?: string[];
  /** Turn a stored value into display text (role codes, region codes). */
  display?: Record<string, string>;
  placeholder?: string;
  range?: { min: string; max?: string; unit?: string; step?: number; presets?: { label: string; min?: number; max?: number }[] };
  yes?: string;
  no?: string;
  hint?: string;
}

export const SIZE_ORDER = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"];
export const STAGE_ORDER = [
  "Pre-Seed",
  "Seed",
  "Angel",
  "Accelerator",
  "Early Stage",
  "Series A",
  "Series B",
  "Series C",
  "Series D+",
  "Growth",
  "Late Stage",
  "Buyout/PE",
  "Fund of Funds",
  "Venture Debt",
];
export const STATUS_OPTIONS = [
  { value: "new", label: "Not contacted yet" },
  { value: "queued", label: "Queued in Outbox" },
  { value: "contacted", label: "Contacted" },
  { value: "opened", label: "Opened my email" },
  { value: "replied", label: "Replied" },
  { value: "no_reply", label: "Contacted, no reply" },
];

export const FILTERS: FilterDef[] = [
  { key: "titles", label: "Job title", group: "Person", kind: "pills", placeholder: "Partner, managing director", hint: "Matches any title containing a word. Partner also finds Managing Partner and General Partner." },
  { key: "titlesNot", label: "Exclude titles", group: "Person", kind: "pills", placeholder: "Analyst, intern" },
  { key: "roles", label: "Role", group: "Person", kind: "multi", facet: "role", display: ROLES, order: Object.keys(ROLES) },
  { key: "names", label: "Name", group: "Person", kind: "pills", placeholder: "Name contains" },
  { key: "firms", label: "Firm name", group: "Firm", kind: "pills", placeholder: "Sequoia, ventures" },
  { key: "firmsNot", label: "Exclude firms", group: "Firm", kind: "pills", placeholder: "Firm contains" },
  { key: "industries", label: "Firm industry", group: "Firm", kind: "multi", facet: "industry" },
  { key: "industriesNot", label: "Exclude industries", group: "Firm", kind: "multi", facet: "industry" },
  { key: "sizes", label: "Firm size", group: "Firm", kind: "multi", facet: "size", order: SIZE_ORDER, hint: "Employees at the firm." },
  {
    key: "founded",
    label: "Year founded",
    group: "Firm",
    kind: "range",
    range: {
      min: "foundedMin",
      max: "foundedMax",
      step: 1,
      presets: [
        { label: "Since 2020", min: 2020 },
        { label: "Since 2015", min: 2015 },
        { label: "2010 to 2019", min: 2010, max: 2019 },
        { label: "Before 2010", max: 2009 },
      ],
    },
  },
  { key: "about", label: "Firm description", group: "Firm", kind: "pills", placeholder: "pre-seed, female founders", hint: "Words in what the firm says about itself." },
  { key: "stages", label: "Stage", group: "Thesis", kind: "multi", facet: "stage", order: STAGE_ORDER, hint: "Stages and investor types the firm is tagged with." },
  { key: "stagesNot", label: "Exclude stages", group: "Thesis", kind: "multi", facet: "stage", order: STAGE_ORDER },
  { key: "focus", label: "Sector focus", group: "Thesis", kind: "multi", facet: "focus" },
  { key: "focusNot", label: "Exclude sectors", group: "Thesis", kind: "multi", facet: "focus" },
  { key: "specialties", label: "Specialties", group: "Thesis", kind: "pills", facet: "specialty", placeholder: "payments, insurtech", hint: "Words in the firm's listed specialties." },
  { key: "regions", label: "Region", group: "Location", kind: "multi", facet: "region", display: REGIONS, order: Object.keys(REGIONS), hint: "Location filters combine with OR." },
  { key: "countries", label: "Country", group: "Location", kind: "multi", facet: "country" },
  { key: "countriesNot", label: "Exclude countries", group: "Location", kind: "multi", facet: "country" },
  { key: "states", label: "State or county", group: "Location", kind: "multi", facet: "state" },
  { key: "cities", label: "City", group: "Location", kind: "pills", facet: "city", placeholder: "London, San Francisco" },
  { key: "hasEmail", label: "Email", group: "Contact data", kind: "bool", yes: "Has email", no: "No email" },
  { key: "hasPhone", label: "Phone", group: "Contact data", kind: "bool", yes: "Has phone", no: "No phone" },
  { key: "hasLinkedin", label: "LinkedIn", group: "Contact data", kind: "bool", yes: "Has LinkedIn", no: "No LinkedIn" },
  { key: "status", label: "Outreach status", group: "Your activity", kind: "multi", options: STATUS_OPTIONS },
  { key: "saved", label: "Saved", group: "Your activity", kind: "bool", yes: "Saved by you", no: "Not saved" },
  { key: "picks", label: "Claude picks", group: "Your activity", kind: "bool", yes: "Claude picks", no: "Not a Claude pick" },
  {
    key: "fit",
    label: "Fit score",
    group: "Your activity",
    kind: "range",
    range: { min: "minScore", step: 5, presets: [{ label: "40 and above", min: 40 }, { label: "60 and above", min: 60 }, { label: "75 and above", min: 75 }] },
    hint: "How well each investor fits your profile, 0 to 100.",
  },
  { key: "onePerFirm", label: "One per firm", group: "Your activity", kind: "bool", yes: "One person per firm", no: "Everyone at each firm" },
];

export const GROUPS: FilterDef["group"][] = ["Person", "Firm", "Thesis", "Location", "Contact data", "Your activity"];

export type Filters = Record<string, string[] | number | boolean | undefined>;

/** The JSON keys a definition owns. */
export const keysOf = (d: FilterDef) => (d.kind === "range" ? [d.range!.min, ...(d.range!.max ? [d.range!.max] : [])] : [d.key]);

export function isSet(d: FilterDef, f: Filters) {
  return keysOf(d).some((k) => {
    const v = f[k];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null;
  });
}

export const displayValue = (d: FilterDef, v: string) => d.display?.[v] ?? d.options?.find((o) => o.value === v)?.label ?? v;

/** Chip text: "Job title: partner +2", "Year founded: 2015 to 2020", "Has email". */
export function summary(d: FilterDef, f: Filters): string {
  if (d.kind === "bool") return f[d.key] === false ? d.no ?? `Not ${d.label.toLowerCase()}` : d.yes ?? d.label;
  if (d.kind === "range") {
    const lo = f[d.range!.min] as number | undefined;
    const hi = d.range!.max ? (f[d.range!.max] as number | undefined) : undefined;
    const unit = d.range!.unit ? ` ${d.range!.unit}` : "";
    const text = lo != null && hi != null ? `${lo} to ${hi}` : lo != null ? `${lo} and above` : `${hi} and below`;
    return `${d.label}: ${text}${unit}`;
  }
  const vals = (f[d.key] as string[] | undefined) ?? [];
  const first = displayValue(d, vals[0] ?? "");
  return `${d.label}: ${first}${vals.length > 1 ? ` +${vals.length - 1}` : ""}`;
}

/** Job title words that also find their spelled-out or abbreviated forms. */
const TITLE_SYNONYMS: Record<string, string[]> = {
  gp: ["general partner"],
  "general partner": ["gp"],
  md: ["managing director"],
  "managing director": ["md"],
  vp: ["vice president"],
  "vice president": ["vp"],
  ceo: ["chief executive"],
  "chief executive": ["ceo"],
  cio: ["chief investment officer"],
  eir: ["entrepreneur in residence"],
  vc: ["venture capital"],
  angel: ["angel investor"],
};

/** What goes to the server: empty values dropped, search text in q, title abbreviations expanded. */
export function toServer(filters: Filters, q?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) continue;
    if (k === "minScore" && v === 0) continue;
    if (k === "onePerFirm" && v === false) continue;
    out[k] = v;
  }
  for (const k of ["titles", "titlesNot"]) {
    const vals = out[k] as string[] | undefined;
    if (!vals) continue;
    const expanded = new Set(vals.map((v) => v.trim()).filter(Boolean));
    for (const v of [...expanded]) for (const s of TITLE_SYNONYMS[v.toLowerCase()] ?? []) expanded.add(s);
    out[k] = [...expanded].slice(0, 50);
  }
  const text = q?.trim();
  if (text) out.q = text.slice(0, 120);
  return out;
}

export const hasAnyFilter = (f: Filters) => FILTERS.some((d) => isSet(d, f));

/** Saved searches store { v: 1, ...filters, q }. */
export const SAVED_VERSION = 1;
export function fromSaved(raw: Record<string, unknown>): { filters: Filters; q: string } {
  const { q, ...rest } = raw ?? {};
  delete rest.v;
  const known = new Set(FILTERS.flatMap(keysOf));
  const filters: Filters = {};
  for (const [k, val] of Object.entries(rest)) if (known.has(k)) filters[k] = val as Filters[string];
  return { filters, q: typeof q === "string" ? q : "" };
}
