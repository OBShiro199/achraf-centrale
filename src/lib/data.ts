"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DashboardStats, Investor, Match, OutreachMessage } from "@/lib/types";

export interface InvestorRow extends Investor {
  score: number;
  reasons: string[];
  saved: boolean;
  contacted: boolean;
  replied: boolean;
  opened: boolean;
}

/** Investors joined with the founder's fit scores, saves and outreach status. */
export function useInvestors() {
  const [rows, setRows] = useState<InvestorRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [inv, matches, saved, outreach] = await Promise.all([
      supabase.from("investors").select("*").order("full_name"),
      supabase.rpc("match_investors"),
      supabase.from("saved_investors").select("investor_id"),
      supabase.from("outreach_messages").select("investor_id,direction,opened_at"),
    ]);
    if (inv.error) return setError(inv.error.message);
    const m = new Map(((matches.data ?? []) as Match[]).map((x) => [x.investor_id, x]));
    const s = new Set((saved.data ?? []).map((x) => x.investor_id));
    const out = (outreach.data ?? []) as Pick<OutreachMessage, "investor_id" | "direction" | "opened_at">[];
    setRows(
      (inv.data as Investor[]).map((i) => ({
        ...i,
        score: m.get(i.id)?.score ?? 0,
        reasons: m.get(i.id)?.reasons ?? [],
        saved: s.has(i.id),
        contacted: out.some((o) => o.investor_id === i.id && o.direction === "outbound"),
        replied: out.some((o) => o.investor_id === i.id && o.direction === "inbound"),
        opened: out.some((o) => o.investor_id === i.id && o.direction === "outbound" && o.opened_at),
      })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSave = useCallback(async (id: string, saved: boolean) => {
    const supabase = createClient();
    setRows((r) => r?.map((x) => (x.id === id ? { ...x, saved: !saved } : x)) ?? null);
    const { data } = await supabase.auth.getUser();
    const res = saved
      ? await supabase.from("saved_investors").delete().eq("investor_id", id)
      : await supabase.from("saved_investors").insert({ investor_id: id, owner_id: data.user!.id });
    if (res.error) setRows((r) => r?.map((x) => (x.id === id ? { ...x, saved } : x)) ?? null);
  }, []);

  return { rows, error, reload: load, toggleSave, setRows };
}

export function useStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [messages, setMessages] = useState<OutreachMessage[] | null>(null);
  const load = useCallback(async () => {
    const supabase = createClient();
    const [s, m] = await Promise.all([
      supabase.rpc("dashboard_stats").single<DashboardStats>(),
      supabase.from("outreach_messages").select("*").order("sent_at", { ascending: false }).limit(200),
    ]);
    setStats(s.data ?? null);
    setMessages((m.data as OutreachMessage[]) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { stats, messages, reload: load };
}

export function regionOf(location: string | null) {
  if (!location) return "Other";
  if (/UK$/.test(location)) return "UK";
  if (/US$/.test(location)) return "US";
  return "Europe";
}
