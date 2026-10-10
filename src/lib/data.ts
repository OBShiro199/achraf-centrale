"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DirectoryRow } from "@/lib/directory";
import type { DashboardStats, OutreachMessage } from "@/lib/types";

/** The founder's best investors for Home: Claude's shortlist first, then the highest fit scores, one per firm. */
export function useTopMatches(limit = 5) {
  const [rows, setRows] = useState<DirectoryRow[] | null>(null);
  const load = useCallback(async () => {
    const supabase = createClient();
    // Claude's shortlist leads when there is one; otherwise the plain fit score order.
    const { count: picks } = await supabase.from("investor_matches").select("investor_id", { count: "exact", head: true });
    const { data } = await supabase.rpc("search_investors", {
      p_filters: { onePerFirm: true },
      p_sort: picks ? "picks" : "match",
      p_dir: "desc",
      p_limit: limit,
      p_offset: 0,
    });
    setRows(((data as { rows?: DirectoryRow[] } | null)?.rows ?? []) as DirectoryRow[]);
  }, [limit]);
  useEffect(() => {
    void load();
  }, [load]);
  return { rows, reload: load };
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
