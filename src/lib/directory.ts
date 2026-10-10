"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { label, REGIONS, ROLES } from "@/lib/taxonomy";

// Every read goes through security definer functions: the browser never reads investors_achraf or the
// search tables, and gets one page at a time with contact details masked until revealed.

/** One row of the investor directory as `search_investors` returns it. Ids are investors_achraf ids. */
export interface DirectoryRow {
  id: number;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  headline: string | null;
  role: string;
  firm: string;
  firm_domain: string | null;
  firm_website: string | null;
  firm_linkedin: string | null;
  industry: string | null;
  size: string | null;
  founded: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  region: string | null;
  location: string | null;
  stages: string[];
  focus: string[];
  investor_type: string;
  /** Masked (a•••@firm.com) until the founder reveals or exports this investor. Null when none on file. */
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  has_email: boolean;
  has_phone: boolean;
  has_linkedin: boolean;
  unlocked: boolean;
  score: number;
  /** Codes such as "focus:FinTech,AI/ML" or "keywords:payments"; see reasonLabel. */
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

export type SortKey = "match" | "name" | "firm" | "location" | "size" | "founded" | "picks";
export type SortDir = "asc" | "desc";

export interface SearchLimits {
  max_rows: number | null;
  page_size: number;
  plan: string;
}

export type FacetValues = { value: string; n: number }[];
export type LeadFacets = Record<string, FacetValues>;

/** Turns a reason code from the database into a short sentence. */
export function reasonLabel(code: string) {
  const [kind, raw = ""] = code.split(":");
  const items = raw.split(",").filter(Boolean);
  switch (kind) {
    case "focus":
      return `Backs ${items.join(", ")}`;
    case "stage":
      return `Invests at ${items[0]}`;
    case "keywords":
      return `Focus on ${items.join(", ")}`;
    case "country":
      return `Based in ${items[0]}`;
    case "region":
      return `Based in ${label(REGIONS, items[0])}`;
    case "role":
      return label(ROLES, items[0]);
    default:
      return code;
  }
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
      | "timeout"
      | "other",
    message: string,
  ) {
    super(message);
  }
}

export function toLimitError(error: { message: string; code?: string }) {
  if (error.code === "57014" || /statement timeout|canceling statement/i.test(error.message)) {
    return new LimitError("timeout", "That search took too long. Add a more specific filter.");
  }
  const m = error.message.match(/^([a-z_]+): ([\s\S]*)$/);
  if (!m) return new LimitError("other", error.message);
  return new LimitError(m[1] as LimitError["code"], m[2]);
}

export const isUpgradeError = (e: unknown) =>
  e instanceof LimitError && ["daily_limit", "page_limit", "no_reveals", "trial_locked", "export_locked", "no_exports"].includes(e.code);

async function searchPage(server: Record<string, unknown>, sort: SortKey, dir: SortDir, limit: number, offset: number) {
  const { data, error } = await createClient().rpc("search_investors", { p_filters: server, p_sort: sort, p_dir: dir, p_limit: limit, p_offset: offset });
  if (error) throw toLimitError(error);
  return data as { rows: DirectoryRow[]; limits: SearchLimits };
}

/**
 * One page of the directory. The previous page stays on screen (dimmed by the caller) while the next loads,
 * and stale responses are dropped so fast filter changes never flash old rows.
 */
export function useSearch(server: Record<string, unknown>, sort: SortKey, dir: SortDir, page: number, pageSize: number) {
  const [rows, setRows] = useState<DirectoryRow[] | null>(null);
  const [limits, setLimits] = useState<SearchLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LimitError | null>(null);
  const seq = useRef(0);
  const key = JSON.stringify([server, sort, dir, page, pageSize]);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const [f, s, d, p, size] = JSON.parse(key) as [Record<string, unknown>, SortKey, SortDir, number, number];
      const res = await searchPage(f, s, d, size, p * size);
      if (id !== seq.current) return;
      setRows(res.rows);
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

  const patchRow = useCallback((id: number, patch: Partial<DirectoryRow>) => {
    setRows((r) => r?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? null);
  }, []);

  return { rows, limits, loading, error, reload: load, patchRow };
}

/** Counts are capped at 10,000 (10001 means 10,000+) and null when the count took too long. Cached for 5 minutes. */
export const COUNT_CAP = 10000;
const countCache = new Map<string, { at: number; n: number | null }>();

export function useCount(server: Record<string, unknown>) {
  const key = JSON.stringify(server);
  const [state, setState] = useState<{ key: string; n: number | null; loading: boolean }>(() => {
    const cached = countCache.get(key);
    return { key, n: cached?.n ?? null, loading: !cached || Date.now() - cached.at > 300_000 };
  });

  useEffect(() => {
    const hit = countCache.get(key);
    if (hit && Date.now() - hit.at < 300_000) {
      setState({ key, n: hit.n, loading: false });
      return;
    }
    let live = true;
    setState((s) => ({ key, n: s.key === key ? s.n : null, loading: true }));
    void createClient()
      .rpc("count_investors", { p_filters: JSON.parse(key) })
      .then(({ data, error }) => {
        const n = error ? null : (data as number | null);
        countCache.set(key, { at: Date.now(), n });
        if (live) setState({ key, n, loading: false });
      });
    return () => {
      live = false;
    };
  }, [key]);

  return state.key === key ? { count: state.n, loading: state.loading } : { count: null, loading: true };
}

export const invalidateCounts = () => countCache.clear();

/** "1–50 of 10,000+", "1–50 of 230". */
export function countLabel(count: number | null, shown: number) {
  if (count == null) return `${shown}+`;
  if (count > COUNT_CAP) return `${COUNT_CAP.toLocaleString("en-GB")}+`;
  return count.toLocaleString("en-GB");
}

let facetCache: { at: number; facets: LeadFacets } | null = null;

/** The allowed values for every list filter, with counts. Loaded once and kept for 30 minutes. */
export function useLeadFacets() {
  const [facets, setFacets] = useState<LeadFacets | null>(facetCache?.facets ?? null);
  useEffect(() => {
    if (facetCache && Date.now() - facetCache.at < 30 * 60_000) {
      setFacets(facetCache.facets);
      return;
    }
    let live = true;
    void createClient()
      .rpc("lead_facets")
      .then(({ data }) => {
        if (!data) return;
        facetCache = { at: Date.now(), facets: data as LeadFacets };
        if (live) setFacets(facetCache.facets);
      });
    return () => {
      live = false;
    };
  }, []);
  return facets;
}

/** Most rows one export call returns. Each row not already revealed or exported costs one export credit. */
export const EXPORT_BATCH = 500;

export interface ExportResult {
  rows: DirectoryRow[];
  charged: number;
  exports_left: number;
}

/** Exports up to `max` matching investors with full contact details, spending export credits. */
export async function exportMatching(
  server: Record<string, unknown>,
  sort: SortKey,
  dir: SortDir,
  max: number,
  onProgress?: (done: number) => void,
): Promise<ExportResult> {
  const out: DirectoryRow[] = [];
  let charged = 0;
  let left = 0;
  while (out.length < max) {
    const { data, error } = await createClient().rpc("export_investors", {
      p_filters: server,
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
    onProgress?.(out.length);
    if (res.rows.length < Math.min(EXPORT_BATCH, max - (out.length - res.rows.length)) || left <= 0) break;
  }
  return { rows: out, charged, exports_left: left };
}

/** The first rows of the current search, for batch selection. Masked like any search; costs row views. */
export async function fetchMatching(server: Record<string, unknown>, sort: SortKey, dir: SortDir, max: number) {
  const out: DirectoryRow[] = [];
  while (out.length < max) {
    const want = Math.min(100, max - out.length);
    const res = await searchPage(server, sort, dir, want, out.length);
    out.push(...res.rows);
    if (res.rows.length < want) break;
  }
  return out;
}

export interface Contact {
  email: string | null;
  other_emails: string | null;
  phone: string | null;
  linkedin_url: string | null;
}

export interface InvestorDetail {
  headline: string | null;
  about: string | null;
  specialties: string[];
  firm_website: string | null;
  firm_linkedin: string | null;
  industry: string | null;
  size: string | null;
  founded: number | null;
  stages: string[];
  focus: string[];
  unlocked: boolean;
  contact: Contact;
}

export async function investorDetail(id: number) {
  const { data, error } = await createClient().rpc("investor_detail", { p_id: id });
  if (error) throw toLimitError(error);
  return data as InvestorDetail;
}

/** Spends one reveal credit (never twice for the same investor) and returns their contact details. */
export async function revealInvestor(id: number): Promise<Contact> {
  const { data, error } = await createClient().rpc("reveal_investor", { p_id: id });
  if (error) throw toLimitError(error);
  return data as Contact;
}

export async function toggleSaved(id: number, saved: boolean) {
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

// ------------------------------------------------------------------------------------------
// AI search and saved searches

export interface AiSearchResult {
  id: string | null;
  title: string;
  summary: string;
  notes: string[];
  filters: Record<string, unknown>;
  prompt: string;
}

export interface AiSearchRow {
  id: string;
  prompt: string;
  title: string | null;
  summary: string | null;
  notes: string[];
  filters: Record<string, unknown>;
  created_at: string;
}

export async function recentAiSearches(limit = 8) {
  const { data } = await createClient()
    .from("ai_searches")
    .select("id, prompt, title, summary, notes, filters, created_at")
    .eq("ok", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AiSearchRow[];
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function listSavedSearches() {
  const { data } = await createClient().from("saved_searches").select("*").order("updated_at", { ascending: false });
  return (data ?? []) as SavedSearch[];
}

export async function saveSearch(name: string, filters: Record<string, unknown>, id?: string) {
  const supabase = createClient();
  const row = { name: name.trim(), filters, updated_at: new Date().toISOString() };
  const { data, error } = id
    ? await supabase.from("saved_searches").update(row).eq("id", id).select().single()
    : await supabase.from("saved_searches").insert(row).select().single();
  if (error) {
    if (error.code === "23505") throw new Error("You already have a saved search with that name");
    throw new Error(error.message);
  }
  return data as SavedSearch;
}

export async function deleteSavedSearch(id: string) {
  const { error } = await createClient().from("saved_searches").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ------------------------------------------------------------------------------------------
// Plan and limits

export interface Entitlements {
  plan_id: string;
  plan_name: string;
  /** pending = account made, no card yet; trialing = 7 days with a card on file; active = paid. */
  status: "pending" | "trialing" | "active" | "past_due" | "canceled" | "expired";
  active: boolean;
  /** A paid plan: sending, reveals and exports. */
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

const STORAGE_KEY = "centrale.directory.v2";

export interface DirectoryState {
  filters: Record<string, unknown>;
  q: string;
  sort: SortKey;
  dir: SortDir;
}

/** The founder's last search, kept for the browser session so navigating away and back keeps their place. */
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
    // Storage can be unavailable (private windows); the search simply resets next time.
  }
}
