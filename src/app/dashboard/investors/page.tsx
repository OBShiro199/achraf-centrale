"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Search, Send, Sparkles, Star, X } from "lucide-react";
import { AiSearch, AiSearchBanner } from "@/components/app/ai-search";
import { BatchComposer, BATCH_LIMIT } from "@/components/app/batch-composer";
import { ComposeModal } from "@/components/app/compose";
import { useApp } from "@/components/app/context";
import { ExportMenu } from "@/components/app/export-menu";
import { InvestorDrawerBody } from "@/components/app/investor-drawer";
import { InvestorTable } from "@/components/app/investor-table";
import { sameSearch, savedPayload, SavedSearchesMenu, SaveSearchButton } from "@/components/app/saved-searches";
import { SmartFilterBar } from "@/components/app/smart-filters";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Drawer, Empty, Settle, Skeleton } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import {
  COUNT_CAP,
  countLabel,
  fetchMatching,
  invalidateCounts,
  isUpgradeError,
  listSavedSearches,
  loadDirectoryState,
  saveDirectoryState,
  toggleSaved,
  useCount,
  useLeadFacets,
  useSearch,
  type AiSearchResult,
  type DirectoryRow,
  type SavedSearch,
  type SortDir,
  type SortKey,
} from "@/lib/directory";
import { FILTERS, fromSaved, hasAnyFilter, toServer, type Filters } from "@/lib/lead-filters";
import { callFunction, createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("en-GB");

const SORTS: { value: SortKey; label: string; dir: SortDir }[] = [
  { value: "match", label: "Best fit", dir: "desc" },
  { value: "name", label: "Name", dir: "asc" },
  { value: "firm", label: "Firm", dir: "asc" },
  { value: "location", label: "Location", dir: "asc" },
  { value: "size", label: "Firm size", dir: "desc" },
  { value: "founded", label: "Year founded", dir: "desc" },
  { value: "picks", label: "Claude picks order", dir: "asc" },
];
const defaultDir = (k: SortKey) => SORTS.find((s) => s.value === k)?.dir ?? "desc";
const PAGE_SIZE = 50;

// The AI banner and the open saved search live alongside the directory state for this browser session.
const EXTRA_KEY = "centrale.directory.extra.v1";
interface Extra {
  ai: AiSearchResult | null;
  saved: SavedSearch | null;
}
function loadExtra(): Extra {
  try {
    const raw = sessionStorage.getItem(EXTRA_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Extra>) : {};
    return { ai: v.ai ?? null, saved: v.saved ?? null };
  } catch {
    return { ai: null, saved: null };
  }
}
function saveExtra(e: Extra) {
  try {
    sessionStorage.setItem(EXTRA_KEY, JSON.stringify(e));
  } catch {
    // Storage can be unavailable (private windows); the banner simply resets next time.
  }
}

interface Init {
  /** The query string this state was built for. */
  key: string;
  filters: Filters;
  q: string;
  sort: SortKey;
  dir: SortDir;
  ai: AiSearchResult | null;
  saved: SavedSearch | null;
  openSavedId: string | null;
}

function PageSkeleton() {
  return (
    <div className="px-4 py-6 md:px-6">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="mt-2 h-3.5 w-80 max-w-full" />
      <Skeleton className="mt-6 h-[150px] w-full rounded-[8px]" />
      <div className="mt-4 flex flex-wrap gap-2">
        {[280, 140, 130, 110].map((w, i) => (
          <Skeleton key={i} className="h-8" style={{ width: w }} />
        ))}
      </div>
      <Skeleton className="mt-4 h-[480px] w-full rounded-[8px]" />
    </div>
  );
}

function Directory({ init }: { init: Init }) {
  const toast = useToast();
  const { ent, reloadEnt } = useApp();
  const facets = useLeadFacets();
  const sendingLocked = ent != null && !ent.can_send;

  const [filters, setFilters] = useState<Filters>(init.filters);
  const [q, setQ] = useState(init.q);
  const [debouncedQ, setDebouncedQ] = useState(init.q);
  const [sort, setSort] = useState<SortKey>(init.sort);
  const [dir, setDir] = useState<SortDir>(init.dir);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Map<number, DirectoryRow>>(() => new Map());
  const [openRow, setOpenRow] = useState<DirectoryRow | null>(null);
  const [composeFor, setComposeFor] = useState<{ id: number; full_name: string; email: string | null } | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [matching, setMatching] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [directorySize, setDirectorySize] = useState<number | null>(null);
  const [ai, setAi] = useState<AiSearchResult | null>(init.ai);
  const [saved, setSaved] = useState<SavedSearch | null>(init.saved);
  const [prompt, setPrompt] = useState(init.ai?.prompt ?? "");
  // The composer starts open on an empty search and folds away once a search is applied.
  const [aiExpanded, setAiExpanded] = useState(() => !hasAnyFilter(init.filters) && !init.q);
  const [focusSignal, setFocusSignal] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const pageSize = ent?.page_size_max ? Math.min(PAGE_SIZE, ent.page_size_max) : PAGE_SIZE;
  const server = useMemo(() => toServer(filters, debouncedQ), [filters, debouncedQ]);
  const { rows, limits, loading, error, reload, patchRow } = useSearch(server, sort, dir, page, pageSize);
  const { count, loading: counting } = useCount(server);

  // Any change to the search goes back to the first page and drops the selection, in the same render.
  const searchKey = JSON.stringify([server, sort, dir, pageSize]);
  const [lastKey, setLastKey] = useState(searchKey);
  if (lastKey !== searchKey) {
    setLastKey(searchKey);
    setPage(0);
    setSelected(new Map());
  }
  const resultKey = JSON.stringify([server, sort, dir, page, pageSize]);

  useEffect(() => {
    saveDirectoryState({ filters, q: debouncedQ, sort, dir });
  }, [filters, debouncedQ, sort, dir]);

  useEffect(() => {
    saveExtra({ ai, saved });
  }, [ai, saved]);

  useEffect(() => {
    void createClient()
      .rpc("directory_size")
      .then(({ data }) => setDirectorySize((data as number | null) ?? null));
  }, []);

  // AI searches wait for the first page of their results before the dialog closes.
  const waiters = useRef<{ key: string; saw: boolean; resolve: () => void }[]>([]);
  useEffect(() => {
    waiters.current = waiters.current.filter((w) => {
      if (w.key !== resultKey) return true;
      if (loading) {
        w.saw = true;
        return true;
      }
      if (!w.saw) return true;
      w.resolve();
      return false;
    });
  }, [resultKey, loading]);

  const applySaved = useCallback((s: SavedSearch) => {
    const next = fromSaved(s.filters);
    setFilters(next.filters);
    setQ(next.q);
    setDebouncedQ(next.q);
    setSaved(s);
    setAi(null);
    setAiExpanded(false);
  }, []);

  // ?search=<saved search id> opens that saved search.
  useEffect(() => {
    if (!init.openSavedId) return;
    void listSavedSearches().then((list) => {
      const s = list.find((x) => x.id === init.openSavedId);
      if (s) applySaved(s);
      else toast({ title: "That saved search no longer exists", tone: "error" });
    });
  }, [init.openSavedId, applySaved, toast]);

  function applyAi(res: AiSearchResult): Promise<void> {
    const f = fromSaved(res.filters).filters;
    setFilters(f);
    setQ("");
    setDebouncedQ("");
    setAi(res);
    setPrompt(res.prompt);
    setSaved(null);
    setAiExpanded(false);
    setOpenRow(null);
    const target = JSON.stringify([toServer(f, ""), sort, dir, 0, pageSize]);
    if (target === resultKey && !loading) return Promise.resolve();
    return new Promise<void>((resolve) => {
      // Same search already loading: its finish is the one to wait for.
      const w = { key: target, saw: target === resultKey, resolve };
      waiters.current.push(w);
      setTimeout(() => {
        waiters.current = waiters.current.filter((x) => x !== w);
        resolve();
      }, 12_000);
    });
  }

  const changeFilters = (next: Filters) => {
    setFilters(next);
    if (!hasAnyFilter(next)) setAi(null);
  };

  const clearAll = () => {
    setFilters({});
    setQ("");
    setDebouncedQ("");
    setAi(null);
    setSaved(null);
  };

  const onSort = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setDir(defaultDir(k));
    }
  };

  const toggleSelect = (r: DirectoryRow) =>
    setSelected((s) => {
      const n = new Map(s);
      if (n.has(r.id)) n.delete(r.id);
      else n.set(r.id, r);
      return n;
    });

  const selectPage = (on: boolean) =>
    setSelected((s) => {
      const n = new Map(s);
      for (const r of rows ?? []) {
        if (on) n.set(r.id, r);
        else n.delete(r.id);
      }
      return n;
    });

  // How deep this search can go: 10,000 rows, less on plans with a row cap, less again when fewer match.
  const maxRows = limits?.max_rows ?? null;
  const cap = Math.min(COUNT_CAP, maxRows ?? Infinity);
  const exact = count != null && count <= COUNT_CAP ? count : null;
  const reachable = Math.min(cap, exact ?? Infinity);
  const selectable = Math.min(BATCH_LIMIT, reachable);

  async function selectFirstMatching() {
    setSelectingAll(true);
    try {
      const all = await fetchMatching(server, sort, dir, selectable);
      setSelected(new Map(all.map((r) => [r.id, r])));
    } catch (err) {
      toast({ title: "Could not select", body: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setSelectingAll(false);
    }
  }

  async function onSave(r: DirectoryRow) {
    patchRow(r.id, { saved: !r.saved });
    setOpenRow((o) => (o?.id === r.id ? { ...o, saved: !r.saved } : o));
    try {
      await toggleSaved(r.id, r.saved);
      invalidateCounts();
    } catch {
      patchRow(r.id, { saved: r.saved });
      setOpenRow((o) => (o?.id === r.id ? { ...o, saved: r.saved } : o));
      toast({ title: "Could not update saved investors", tone: "error" });
    }
  }

  async function refreshPicks() {
    setMatching(true);
    try {
      const res = await callFunction<{ count: number }>("match-investors", {});
      toast({ title: `${res.count} Claude picks ready`, body: "Sort by Claude picks order, or add the Claude picks filter to see only them." });
      invalidateCounts();
      void reload();
    } catch (err) {
      toast({ title: "Could not refresh picks", body: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setMatching(false);
    }
  }

  const selectedRows = useMemo(() => [...selected.values()], [selected]);
  const emailable = useMemo(() => selectedRows.filter((r) => r.has_email), [selectedRows]);
  const noEmail = selectedRows.length - emailable.length;

  function draftEmails() {
    if (sendingLocked) {
      toast({ title: "Emailing starts with your plan", body: "Your inbox is ready. Sending starts when the 7-day trial ends and your plan starts." });
      return;
    }
    if (!emailable.length) {
      toast({ title: "None of these investors have an email on file", tone: "error" });
      return;
    }
    if (emailable.length > BATCH_LIMIT) {
      toast({ title: `Draft up to ${BATCH_LIMIT} at a time`, body: "Untick a few so each email can be checked before it goes.", tone: "error" });
      return;
    }
    setBatchOpen(true);
  }

  const anyFilter = hasAnyFilter(filters);
  const anySearch = anyFilter || !!debouncedQ.trim();
  const currentPayload = useMemo(() => savedPayload(filters, debouncedQ), [filters, debouncedQ]);
  const savedEdited = !!saved && !sameSearch(currentPayload, saved.filters);
  const aiEdited = !!ai && !sameSearch(toServer(fromSaved(ai.filters).filters), toServer(filters, debouncedQ));

  const shownFrom = rows?.length ? page * pageSize + 1 : 0;
  const shownTo = page * pageSize + (rows?.length ?? 0);
  const hasNext = !!rows && rows.length === pageSize && (page + 1) * pageSize < reachable;
  const totalPages = exact != null ? Math.max(1, Math.ceil(Math.min(exact, cap) / pageSize)) : null;
  const trialCapped = maxRows != null && count != null && count > maxRows;
  const deepCapped = !trialCapped && count != null && count > COUNT_CAP && !hasNext && !!rows && rows.length > 0 && (page + 1) * pageSize >= COUNT_CAP;

  return (
    <div className="px-4 py-6 pb-28 md:px-6">
      <Settle className="relative z-30 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[26px] tracking-[-0.04em]">Investors</h2>
          <p className="mt-1 text-[14px] text-muted">
            {directorySize == null ? (
              <Skeleton className="inline-block h-3 w-72 max-w-full align-middle" />
            ) : (
              <>
                <span className="tabular font-medium text-ink">{fmt(directorySize)}</span> investors with an email or LinkedIn profile. Fit is scored against your startup.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void refreshPicks()} disabled={matching}>
            <Sparkles className={cn("h-3.5 w-3.5 text-vermilion", matching && "animate-pulse")} />
            {matching ? "Matching" : "Refresh Claude picks"}
          </Button>
          <ExportMenu
            total={count}
            selected={selectedRows}
            server={server}
            sort={sort}
            dir={dir}
            ent={ent}
            onDone={() => {
              void reload();
              void reloadEnt();
            }}
          />
        </div>
      </Settle>

      <Settle delay={40} className="mt-5">
        <AiSearch
          expanded={aiExpanded}
          onExpandedChange={setAiExpanded}
          prompt={prompt}
          onPromptChange={setPrompt}
          focusSignal={focusSignal}
          onApply={applyAi}
          directorySize={directorySize}
        />
      </Settle>

      <Settle delay={70} className="relative z-[25] mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-label" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, firm, title, city"
            aria-label="Search name, firm, title, city"
            maxLength={120}
            className="h-8 w-full rounded-[6px] border border-line bg-panel pl-8 pr-7 text-[13px] text-ink shadow-[0_1px_0_rgba(57,28,37,0.03)] placeholder:text-faint focus:border-label focus:outline-none sm:w-[280px]"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-label hover:text-ink" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center">
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => {
                const k = e.target.value as SortKey;
                setSort(k);
                setDir(defaultDir(k));
              }}
              aria-label="Sort by"
              className={cn(
                "h-8 w-[184px] appearance-none border border-line bg-panel pl-2.5 pr-7 text-[13px] text-ink shadow-[0_1px_0_rgba(57,28,37,0.03)] focus:border-label focus:outline-none",
                sort === "picks" ? "rounded-[6px]" : "rounded-l-[6px]",
              )}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  Sort: {s.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-label" />
          </div>
          {sort !== "picks" && (
            <button
              onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="-ml-px flex h-8 w-8 items-center justify-center rounded-r-[6px] border border-line bg-panel text-label hover:text-ink"
              aria-label={dir === "asc" ? "Ascending, switch to descending" : "Descending, switch to ascending"}
            >
              {dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        <SavedSearchesMenu
          active={saved}
          edited={savedEdited}
          onOpen={applySaved}
          onDeleted={(id) => setSaved((s) => (s?.id === id ? null : s))}
        />
        <SaveSearchButton filters={filters} q={debouncedQ} active={saved} disabled={!anySearch} onSaved={setSaved} />
      </Settle>

      {ai && (
        <div className="mt-4">
          <AiSearchBanner
            result={ai}
            edited={aiEdited}
            onEdit={() => {
              setPrompt(ai.prompt);
              setAiExpanded(true);
              setFocusSignal((n) => n + 1);
            }}
            onNew={() => {
              clearAll();
              setPrompt("");
              setAiExpanded(true);
              setFocusSignal((n) => n + 1);
            }}
          />
        </div>
      )}

      <Settle delay={100} className="relative z-20 mt-3">
        <SmartFilterBar defs={FILTERS} filters={filters} onChange={changeFilters} facets={facets} />
      </Settle>

      <Settle delay={130} className="relative z-10 mt-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13px]">
          <p className="tabular text-muted" aria-live="polite">
            {rows == null || (loading && !rows.length) ? (
              "Loading investors"
            ) : rows.length === 0 ? (
              "No investors match"
            ) : (
              <>
                Investors {fmt(shownFrom)} to {fmt(shownTo)}
                {counting ? <span className="text-label">, counting matches</span> : <> of {countLabel(count, shownTo)}</>}
              </>
            )}
          </p>
          {trialCapped && (
            <p className="text-[12.5px] text-label">
              {ent?.paid ? "Your plan" : "Your trial"} shows the first {fmt(maxRows!)} results.{" "}
              <Link href="/dashboard/billing" className="text-ink underline underline-offset-2 hover:text-vermilion">
                See plans
              </Link>
            </p>
          )}
        </div>

        <Card className="overflow-hidden">
          {error ? (
            <Empty
              title={
                isUpgradeError(error)
                  ? "You have reached a plan limit"
                  : error.code === "timeout"
                    ? "That search took too long"
                    : error.code === "rate_limited"
                      ? "Slow down a moment"
                      : "Could not load investors"
              }
              body={error.code === "timeout" ? "Add a more specific filter." : error.message}
              action={
                isUpgradeError(error) ? (
                  <ButtonLink href="/dashboard/billing" size="sm" variant="primary">
                    See plans
                  </ButtonLink>
                ) : (
                  <Button size="sm" onClick={() => void reload()}>
                    Try again
                  </Button>
                )
              }
            />
          ) : (
            <>
              <InvestorTable
                rows={rows ?? []}
                loading={loading}
                sort={sort}
                dir={dir}
                onSort={onSort}
                onOpen={setOpenRow}
                onSave={(r) => void onSave(r)}
                onEmail={(r) => setComposeFor({ id: r.id, full_name: r.full_name, email: r.email })}
                selected={selected}
                onSelect={toggleSelect}
                onSelectPage={selectPage}
              />
              {!loading && rows?.length === 0 && (
                <Empty
                  title={page > 0 ? "No more investors on this page" : "No investors match every filter"}
                  body={
                    page > 0
                      ? "Go back a page to see the rest."
                      : anySearch
                        ? "Filters stack, so each one narrows the list. Remove a chip above to widen it."
                        : "Nothing to show yet. Try again in a moment."
                  }
                  action={
                    page > 0 ? (
                      <Button size="sm" onClick={() => setPage(0)}>
                        First page
                      </Button>
                    ) : anySearch ? (
                      <Button size="sm" onClick={clearAll}>
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </>
          )}

          {!error && rows != null && rows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 px-4 py-2.5 text-[12.5px] text-label">
              <span>
                {deepCapped
                  ? "Pages stop at 10,000 results. Add a filter to reach the rest."
                  : trialCapped && !hasNext
                    ? `That is as far as ${ent?.paid ? "your plan" : "the trial"} goes.`
                    : ""}
              </span>
              <nav className="flex items-center gap-2" aria-label="Pages">
                <Button size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </Button>
                <span className="tabular min-w-[86px] text-center text-muted">
                  Page {fmt(page + 1)}
                  {totalPages != null && ` of ${fmt(totalPages)}`}
                </span>
                <Button size="sm" disabled={!hasNext || loading} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </nav>
            </div>
          )}
        </Card>
      </Settle>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            role="region"
            aria-label="Selected investors"
            className="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-[min(760px,calc(100%-32px))] flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-night bg-night px-4 py-2.5 text-ivory shadow-[0_20px_50px_-20px_rgba(57,28,37,0.6)]"
          >
            <span className="tabular text-[13.5px] font-medium">{fmt(selected.size)} selected</span>
            {selected.size < selectable && (count == null || count > selected.size) && (
              <button
                onClick={() => void selectFirstMatching()}
                disabled={selectingAll}
                className="text-[12.5px] text-ivory/70 underline-offset-2 hover:text-ivory hover:underline disabled:opacity-60"
              >
                {selectingAll ? "Selecting" : `Select first ${fmt(selectable)} matching`}
              </button>
            )}
            {noEmail > 0 && (
              <span className="text-[12px] text-ivory/60">
                {fmt(noEmail)} without an email {noEmail === 1 ? "is" : "are"} left out of emails
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={async () => {
                  const unsaved = selectedRows.filter((r) => !r.saved);
                  for (const r of unsaved) patchRow(r.id, { saved: true });
                  try {
                    await Promise.all(unsaved.map((r) => toggleSaved(r.id, false)));
                    invalidateCounts();
                    toast({ title: `Saved ${fmt(unsaved.length)} investor${unsaved.length === 1 ? "" : "s"}` });
                  } catch {
                    toast({ title: "Some could not be saved", tone: "error" });
                    void reload();
                  }
                }}
                className="flex h-8 items-center gap-1.5 rounded-[6px] border border-ivory/20 px-3 text-[13px] hover:border-ivory/40"
              >
                <Star className="h-3.5 w-3.5" /> Save
              </button>
              <button
                onClick={draftEmails}
                aria-disabled={sendingLocked || !emailable.length || emailable.length > BATCH_LIMIT}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-[6px] bg-vermilion px-3 text-[13px] font-medium text-ivory hover:brightness-105",
                  (sendingLocked || !emailable.length || emailable.length > BATCH_LIMIT) && "opacity-50",
                )}
              >
                <Send className="h-3.5 w-3.5" /> Draft emails{emailable.length && emailable.length !== selected.size ? ` (${fmt(emailable.length)})` : ""}
              </button>
              <button onClick={() => setSelected(new Map())} className="rounded-[6px] p-1.5 text-ivory/70 hover:text-ivory" aria-label="Clear selection">
                <X className="h-4 w-4" />
              </button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <Drawer open={!!openRow} onClose={() => setOpenRow(null)}>
        {openRow && (
          <InvestorDrawerBody
            row={openRow}
            onEmail={() => setComposeFor({ id: openRow.id, full_name: openRow.full_name, email: openRow.email })}
            onSave={() => void onSave(openRow)}
            selected={selected.has(openRow.id)}
            onSelect={() => toggleSelect(openRow)}
            revealsLeft={ent?.reveals_left ?? null}
            onRevealed={(c) => {
              patchRow(openRow.id, { ...c, unlocked: true });
              setOpenRow({ ...openRow, ...c, unlocked: true });
              void reloadEnt();
            }}
            onKeyword={(k) => {
              const current = (filters.specialties as string[] | undefined) ?? [];
              if (!current.some((x) => x.toLowerCase() === k.toLowerCase())) changeFilters({ ...filters, specialties: [...current, k] });
              setOpenRow(null);
              toast({ title: `Filtering by "${k}"`, body: "Added to the Specialties filter." });
            }}
          />
        )}
      </Drawer>

      <ComposeModal
        investor={composeFor}
        onClose={() => setComposeFor(null)}
        onSent={() => {
          invalidateCounts();
          void reload();
          setOpenRow(null);
        }}
      />

      <BatchComposer
        rows={emailable}
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        onQueued={() => {
          setSelected(new Map());
          invalidateCounts();
          void reload();
        }}
      />
    </div>
  );
}

/** Restores the founder's last search after mount (sessionStorage), then applies ?search=, ?picks=1 or ?saved=1. */
function DirectoryLoader() {
  const params = useSearchParams();
  const key = params.toString();
  const [init, setInit] = useState<Init | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(key);
    const restored = loadDirectoryState();
    const extra = loadExtra();
    const sort = SORTS.some((s) => s.value === restored?.sort) ? restored!.sort : "match";
    let next: Init = {
      key,
      filters: fromSaved(restored?.filters ?? {}).filters,
      q: typeof restored?.q === "string" ? restored.q : "",
      sort,
      dir: restored?.dir === "asc" ? "asc" : restored?.dir === "desc" ? "desc" : defaultDir(sort),
      ai: extra.ai,
      saved: extra.saved,
      openSavedId: p.get("search"),
    };
    if (p.get("picks") === "1") next = { ...next, filters: { picks: true }, q: "", sort: "picks", dir: "asc", ai: null, saved: null };
    else if (p.get("saved") === "1") next = { ...next, filters: { saved: true }, q: "", ai: null, saved: null };
    setInit(next);
  }, [key]);

  if (!init || init.key !== key) return <PageSkeleton />;
  return <Directory key={key} init={init} />;
}

export default function InvestorsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DirectoryLoader />
    </Suspense>
  );
}
