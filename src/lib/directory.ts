"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { label, REGIONS, ROLES, SECTORS, STAGES, VALUES } from "@/lib/taxonomy";

/** One row of the investor directory as `search_investors` returns it. */
export interface DirectoryRow {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  role: string;
  firm: string;
  firm_domain: string | null;
  /** Masked (a•••@firm.com) until the founder reveals this investor. */
  email: string;
  phone: string | null;
  mobile: string | null;
  direct_phone: string | null;
  do_not_call: boolean;
  city: string | null;
  state: string | null;
  country: string | null;
  region: string | null;
  location: string | null;
  investor_type: string;
  stages: string[];
  sectors: string[];
  values: string[];
  firm_employees: number | null;
  firm_funding: number | null;
  firm_founded: number | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  website_url: string | null;
  has_mobile: boolean;
  has_direct: boolean;
  has_phone: boolean;
  has_linkedin: boolean;
  has_twitter: boolean;
  /** Contact details are visible: revealed, exported, or a test contact. */
  unlocked: boolean;
  source: "demo" | "test" | "contacts";
  score: number;
  /** Codes such as "sector:fintech" or "keywords:payments,insurtech"; see reasonLabel. */
  reasons: string[];
  saved: boolean;
  contacted: boolean;
  replied: boolean;
  opened: boolean;
  queued: boolean;
  pick_rank: number | null;
  pick_fit: number | null;
  pick_why: string | null;
}

export type ContactStatus = "any" | "new" | "queued" | "contacted" | "opened" | "replied" | "no_reply";

/**
 * Filters stack with AND across groups and OR within a group. Location (regions, countries and
 * cities) is one group. Keywords match any or all; excluded keywords never match.
 */
export interface DirectoryFilters {
  q?: string;
  types?: string[];
  stages?: string[];
  sectors?: string[];
  values?: string[];
  regions?: string[];
  countries?: string[];
  cities?: string[];
  roles?: string[];
  /** A hand-picked list, used to export a selection. */
  ids?: string[];
  keywords?: string[];
  keyword_mode?: "any" | "all";
  exclude_keywords?: string[];
  firm_size?: string[];
  firm_funding?: string[];
  founded_after?: number | null;
  founded_before?: number | null;
  has?: string[];
  status?: ContactStatus;
  saved_only?: boolean;
  picks_only?: boolean;
  one_per_firm?: boolean;
  min_score?: number;
  include_non_investors?: boolean;
}

export type SortKey = "match" | "name" | "firm" | "location" | "size" | "funding" | "founded" | "picks";
export type SortDir = "asc" | "desc";

export interface Facets {
  total: number;
  types: Record<string, number>;
  stages: Record<string, number>;
  sectors: Record<string, number>;
  values: Record<string, number>;
  regions: Record<string, number>;
  countries: Record<string, number>;
  cities: Record<string, number>;
  roles: Record<string, number>;
  firm_size: Record<string, number>;
  firm_funding: Record<string, number>;
  has: Record<string, number>;
  status: Record<string, number>;
  saved: number;
  picks: number;
}

export const FIRM_SIZES: Record<string, string> = {
  "1_10": "1 to 10 people",
  "11_50": "11 to 50 people",
  "51_200": "51 to 200 people",
  "201_1000": "201 to 1,000 people",
  "1000_plus": "More than 1,000",
};

export const FIRM_FUNDING: Record<string, string> = {
  under_50m: "Under $50m",
  "50_250m": "$50m to $250m",
  "250m_1b": "$250m to $1b",
  "1b_plus": "More than $1b",
};

export const HAS: Record<string, string> = {
  mobile: "Mobile number",
  direct: "Direct line",
  any_phone: "Any phone number",
  firm_phone: "Firm phone",
  linkedin: "LinkedIn profile",
  twitter: "X profile",
  website: "Firm website",
};

export const STATUS: Record<ContactStatus, string> = {
  any: "Any status",
  new: "Not contacted yet",
  queued: "Queued in Outbox",
  contacted: "Contacted",
  opened: "Opened my email",
  replied: "Replied",
  no_reply: "Contacted, no reply",
};

export const MIN_SCORES = [
  { value: 0, label: "Any fit" },
  { value: 40, label: "40 and above" },
  { value: 60, label: "60 and above" },
  { value: 75, label: "75 and above" },
];

/** Turns a reason code from the database into a short sentence. */
export function reasonLabel(code: string) {
  const [kind, raw = ""] = code.split(":");
  const items = raw.split(",").filter(Boolean);
  switch (kind) {
    case "sector":
      return `Backs ${items.map((s) => label(SECTORS, s)).join(", ")}`;
    case "stage":
      return `Invests at ${label(STAGES, items[0])}`;
    case "keywords":
      return `Focus on ${items.join(", ")}`;
    case "country":
    case "region":
      return `Based in ${kind === "region" ? label(REGIONS, items[0]) : items[0]}`;
    case "values":
      return `Shares ${items.map((v) => label(VALUES, v).toLowerCase()).join(", ")}`;
    case "role":
      return label(ROLES, items[0]);
    default:
      return code;
  }
}

export function formatFunding(n: number | null) {
  if (!n) return null;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, "")}b`;
  if (n >= 1e6) return `$${Math.round(n / 1e6)}m`;
  return `$${Math.round(n / 1e3)}k`;
}

/** Drops empty values so the payload and the "any filter" check stay honest. */
export function cleanFilters(f: DirectoryFilters): DirectoryFilters {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v == null || v === false || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (k === "status" && v === "any") continue;
    if (k === "min_score" && v === 0) continue;
    if (k === "keyword_mode" && v === "any") continue;
    if (k === "q") {
      const q = String(v).trim();
      if (q) out.q = q;
      continue;
    }
    out[k] = v;
  }
  return out as DirectoryFilters;
}

export const hasFilters = (f: DirectoryFilters) => {
  const c = cleanFilters(f);
  delete c.one_per_firm;
  return Object.keys(c).length > 0;
};

export interface SearchLimits {
  max_rows: number | null;
  page_size: number;
  plan: string;
}

/** Errors from the metered database functions arrive as "code: sentence". */
export class LimitError extends Error {
  constructor(
    public code:
      | "rate_limited"
      | "daily_limit"
      | "page_limit"
      | "no_reveals"
      | "trial_locked"
      | "export_locked"
      | "no_exports"
      | "not_signed_in"
      | "not_found"
      | "other",
    message: string,
  ) {
    super(message);
  }
}

export function toLimitError(error: { message: string }) {
  const m = error.message.match(/^([a-z_]+): ([\s\S]*)$/);
  if (!m) return new LimitError("other", error.message);
  return new LimitError(m[1] as LimitError["code"], m[2]);
}

export const isUpgradeError = (e: unknown) =>
  e instanceof LimitError && ["daily_limit", "page_limit", "no_reveals", "trial_locked", "export_locked", "no_exports"].includes(e.code);

async function search(filters: DirectoryFilters, sort: SortKey, dir: SortDir, limit: number, offset: number) {
  const { data, error } = await createClient().rpc("search_investors", {
    p_filters: cleanFilters(filters),
    p_sort: sort,
    p_dir: dir,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw toLimitError(error);
  return data as { total: number; rows: DirectoryRow[]; limits: SearchLimits };
}

/** A page of the directory. Stale responses are dropped, so fast filter changes never flash old rows. */
export function useDirectory(filters: DirectoryFilters, sort: SortKey, dir: SortDir, page: number, pageSize: number) {
  const [rows, setRows] = useState<DirectoryRow[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [limits, setLimits] = useState<SearchLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LimitError | null>(null);
  const seq = useRef(0);
  const key = JSON.stringify([cleanFilters(filters), sort, dir, page, pageSize]);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const [f, s, d, p, size] = JSON.parse(key) as [DirectoryFilters, SortKey, SortDir, number, number];
      const res = await search(f, s, d, size, p * size);
      if (id !== seq.current) return;
      setRows(res.rows);
      setTotal(res.total);
      setLimits(res.limits);
    } catch (err) {
      if (id !== seq.current) return;
      setError(err instanceof LimitError ? err : new LimitError("other", "Could not load investors"));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = useCallback((id: string, patch: Partial<DirectoryRow>) => {
    setRows((r) => r?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? null);
  }, []);

  return { rows, total, limits, loading, error, reload: load, patchRow };
}

/** Option counts for every filter menu, each counted with all the other filters applied. */
export function useFacets(filters: DirectoryFilters) {
  const [facets, setFacets] = useState<Facets | null>(null);
  const seq = useRef(0);
  const key = JSON.stringify(cleanFilters(filters));

  const load = useCallback(async () => {
    const id = ++seq.current;
    const { data } = await createClient().rpc("investor_facets", { p_filters: JSON.parse(key) });
    if (id === seq.current && data) setFacets(data as Facets);
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  return { facets, reload: load };
}

/** Most rows one export call returns. Each row not already unlocked costs one export credit. */
export const EXPORT_BATCH = 1000;

export interface ExportResult {
  rows: DirectoryRow[];
  total: number;
  charged: number;
  exports_left: number;
}

/** Exports matching investors with full contact details, spending export credits, up to `max` rows. */
export async function exportMatching(
  filters: DirectoryFilters,
  sort: SortKey,
  dir: SortDir,
  max: number,
  onProgress?: (done: number, of: number) => void,
): Promise<ExportResult> {
  const out: DirectoryRow[] = [];
  let charged = 0;
  let left = Infinity;
  let total = 0;
  while (out.length < max) {
    const { data, error } = await createClient().rpc("export_investors", {
      p_filters: cleanFilters(filters),
      p_sort: sort,
      p_dir: dir,
      p_limit: Math.min(EXPORT_BATCH, max - out.length),
      p_offset: out.length,
    });
    if (error) throw toLimitError(error);
    const res = data as ExportResult;
    out.push(...res.rows);
    charged += res.charged;
    left = res.exports_left;
    total = res.total;
    onProgress?.(out.length, Math.min(max, total));
    if (!res.rows.length || out.length >= total || left <= 0) break;
  }
  return { rows: out, total, charged, exports_left: left === Infinity ? 0 : left };
}

/** First rows of the current search, for batch selection. Masked like any search; costs row views. */
export async function fetchMatching(filters: DirectoryFilters, sort: SortKey, dir: SortDir, max: number) {
  const out: DirectoryRow[] = [];
  let total = Infinity;
  while (out.length < Math.min(total, max)) {
    const res = await search(filters, sort, dir, Math.min(100, max - out.length), out.length);
    total = res.total;
    out.push(...res.rows);
    if (!res.rows.length) break;
  }
  return out;
}

export interface Contact {
  email: string;
  phone: string | null;
  mobile: string | null;
  direct_phone: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
}

/** Spends one reveal credit (never twice for the same investor) and returns their contact details. */
export async function revealInvestor(id: string): Promise<Contact> {
  const { data, error } = await createClient().rpc("reveal_investor", { p_id: id });
  if (error) throw toLimitError(error);
  return data as Contact;
}

export interface Entitlements {
  plan_id: string;
  plan_name: string;
  /** pending = account made, no card yet; trialing = 7 days with a card on file; active = paid. */
  status: "pending" | "trialing" | "active" | "past_due" | "canceled" | "expired";
  active: boolean;
  /** A paid plan: inbox, sending, reveals and exports. */
  paid: boolean;
  can_send: boolean;
  manage_url: string | null;
  trial_ends_at: string | null;
  period_start: string;
  period_end: string | null;
  max_rows: number | null;
  page_size_max: number;
  reveals_total: number;
  reveals_left: number;
  exports_total: number;
  exports_left: number;
  daily_row_views: number;
  rows_viewed_today: number;
  searches_per_minute: number;
  /** Whole days left in the trial, worked out when loaded. */
  trial_days_left: number | null;
}

/** The founder's plan, limits and what is left this period. */
export function useEntitlements() {
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const load = useCallback(async () => {
    const { data } = await createClient().rpc("my_entitlements");
    if (!data) return;
    const e = data as Entitlements;
    const left = e.trial_ends_at ? Math.max(0, Math.ceil((new Date(e.trial_ends_at).getTime() - Date.now()) / 86_400_000)) : null;
    setEnt({ ...e, trial_days_left: left });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { ent, reload: load };
}

export async function toggleSaved(id: string, saved: boolean) {
  const supabase = createClient();
  if (saved) {
    const { error } = await supabase.from("saved_investors").delete().eq("investor_id", id);
    if (error) throw error;
  } else {
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.from("saved_investors").insert({ investor_id: id, owner_id: data.user!.id });
    if (error) throw error;
  }
}

const STORAGE_KEY = "centrale.directory.v1";

export interface DirectoryState {
  filters: DirectoryFilters;
  sort: SortKey;
  dir: SortDir;
  pageSize: number;
}

/** The founder's last filters, kept for the browser session so navigating away and back keeps their place. */
export function loadDirectoryState(): DirectoryState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DirectoryState) : null;
  } catch {
    return null;
  }
}

export function saveDirectoryState(state: DirectoryState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private windows); filters simply reset next time.
  }
}
