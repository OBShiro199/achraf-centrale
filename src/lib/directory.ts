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

async function search(filters: DirectoryFilters, sort: SortKey, dir: SortDir, limit: number, offset: number) {
  const { data, error } = await createClient().rpc("search_investors", {
    p_filters: cleanFilters(filters),
    p_sort: sort,
    p_dir: dir,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  return data as { total: number; rows: DirectoryRow[] };
}

/** A page of the directory. Stale responses are dropped, so fast filter changes never flash old rows. */
export function useDirectory(filters: DirectoryFilters, sort: SortKey, dir: SortDir, page: number, pageSize: number) {
  const [rows, setRows] = useState<DirectoryRow[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    } catch (err) {
      if (id !== seq.current) return;
      setError(err instanceof Error ? err.message : "Could not load investors");
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

  return { rows, total, loading, error, reload: load, patchRow };
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

export const EXPORT_LIMIT = 5000;

/** Fetches every matching row (up to EXPORT_LIMIT) in pages of 1,000, in the order shown. */
export async function fetchAllMatching(filters: DirectoryFilters, sort: SortKey, dir: SortDir, onProgress?: (done: number, total: number) => void) {
  const out: DirectoryRow[] = [];
  let total = Infinity;
  while (out.length < Math.min(total, EXPORT_LIMIT)) {
    const res = await search(filters, sort, dir, Math.min(1000, EXPORT_LIMIT - out.length), out.length);
    total = res.total;
    out.push(...res.rows);
    onProgress?.(out.length, Math.min(total, EXPORT_LIMIT));
    if (!res.rows.length) break;
  }
  return { rows: out, total: total === Infinity ? 0 : total };
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
