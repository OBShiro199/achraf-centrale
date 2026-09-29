"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Minus, Plus, Search, Send, Sparkles, Star, X } from "lucide-react";
import { BatchComposer, BATCH_LIMIT } from "@/components/app/batch-composer";
import { ComposeModal } from "@/components/app/compose";
import { ChoiceMenu, FilterChip, FilterMenu, GroupedMenu, PanelMenu, Toggle, type Option } from "@/components/app/filter-menu";
import { ExportMenu } from "@/components/app/export-menu";
import { InvestorDrawerBody } from "@/components/app/investor-drawer";
import { InvestorTable } from "@/components/app/investor-table";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Card, Drawer, Empty, Settle, Skeleton } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { Hand } from "@/components/sketch/hand";
import { callFunction, createClient } from "@/lib/supabase/client";
import {
  cleanFilters,
  fetchAllMatching,
  FIRM_FUNDING,
  FIRM_SIZES,
  HAS,
  hasFilters,
  loadDirectoryState,
  MIN_SCORES,
  saveDirectoryState,
  STATUS,
  toggleSaved,
  useDirectory,
  useFacets,
  type ContactStatus,
  type DirectoryFilters,
  type DirectoryRow,
  type DirectoryState,
  type Facets,
  type SortKey,
} from "@/lib/directory";
import { INVESTOR_TYPES, label, REGIONS, ROLES, SECTORS, STAGES, VALUES } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

const DEFAULT_STATE: DirectoryState = { filters: {}, sort: "match", dir: "desc", pageSize: 50 };

/** Options for a taxonomy, with live counts; unknown keys in the counts are appended so nothing is hidden. */
function options(map: Record<string, string>, counts: Record<string, number> | undefined): Option[] {
  const keys = [...Object.keys(map), ...Object.keys(counts ?? {}).filter((k) => !(k in map))];
  return keys.map((k) => ({ value: k, label: label(map, k), count: counts ? counts[k] ?? 0 : undefined }));
}

/** Options straight from counts (countries, cities), largest first. */
function countOptions(counts: Record<string, number> | undefined, selected: string[]): Option[] {
  const entries = Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1]);
  for (const s of selected) if (!entries.some(([k]) => k === s)) entries.unshift([s, 0]);
  return entries.map(([k, n]) => ({ value: k, label: k, count: n }));
}

function KeywordPanel({ filters, set }: { filters: DirectoryFilters; set: (p: Partial<DirectoryFilters>) => void }) {
  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState<{ keyword: string; df: number }[]>([]);
  const include = filters.keywords ?? [];
  const exclude = filters.exclude_keywords ?? [];

  useEffect(() => {
    const t = term.trim().toLowerCase();
    const timer = setTimeout(async () => {
      let q = createClient().from("investor_keywords").select("keyword, df").order("df", { ascending: false }).limit(14);
      if (t) q = q.ilike("keyword", `%${t.replace(/[%_]/g, "")}%`);
      const { data } = await q;
      setSuggestions((data ?? []) as { keyword: string; df: number }[]);
    }, 180);
    return () => clearTimeout(timer);
  }, [term]);

  const add = (k: string, to: "include" | "exclude") => {
    const inc = include.filter((x) => x !== k);
    const exc = exclude.filter((x) => x !== k);
    set(to === "include" ? { keywords: [...inc, k], exclude_keywords: exc } : { keywords: inc, exclude_keywords: [...exc, k] });
  };

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-label" />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && term.trim()) {
              add(term.trim().toLowerCase(), "include");
              setTerm("");
            }
          }}
          placeholder="Search 30,000 investor keywords"
          className="h-8 w-full rounded-[5px] border border-line bg-panel-2 pl-7 pr-2 text-[13px] text-ink placeholder:text-faint focus:border-[#ae9d92] focus:outline-none"
        />
      </div>
      <div className="quiet-scroll mt-2 max-h-[220px] overflow-y-auto">
        {suggestions.map((s) => (
          <div key={s.keyword} className="group flex items-center gap-2 rounded-[5px] px-1.5 py-1 hover:bg-black/[0.03]">
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s.keyword}</span>
            <span className="tabular text-[11px] text-faint">{s.df.toLocaleString("en-GB")}</span>
            <button onClick={() => add(s.keyword, "include")} className="rounded-[4px] border border-line p-0.5 text-label hover:border-burgundy hover:text-burgundy" aria-label={`Include ${s.keyword}`}>
              <Plus className="h-3 w-3" />
            </button>
            <button onClick={() => add(s.keyword, "exclude")} className="rounded-[4px] border border-line p-0.5 text-label hover:border-pencil hover:text-pencil" aria-label={`Exclude ${s.keyword}`}>
              <Minus className="h-3 w-3" />
            </button>
          </div>
        ))}
        {!suggestions.length && <p className="px-1.5 py-2 text-[12.5px] text-label">No keywords match. Press Enter to use it anyway.</p>}
      </div>
      {(include.length > 0 || exclude.length > 0) && (
        <div className="mt-2 space-y-2 border-t border-line-2 pt-2">
          {include.length > 1 && (
            <div className="flex items-center gap-1 rounded-[6px] bg-panel-2 p-0.5 text-[12px]">
              {(["any", "all"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => set({ keyword_mode: m })}
                  className={cn(
                    "flex-1 rounded-[5px] px-2 py-1",
                    (filters.keyword_mode ?? "any") === m ? "bg-panel text-ink shadow-[0_1px_2px_rgba(57,28,37,0.08)]" : "text-label hover:text-ink",
                  )}
                >
                  {m === "any" ? "Match any keyword" : "Match every keyword"}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {include.map((k) => (
              <FilterChip key={k} onRemove={() => set({ keywords: include.filter((x) => x !== k) })}>
                {k}
              </FilterChip>
            ))}
            {exclude.map((k) => (
              <FilterChip key={k} tone="exclude" onRemove={() => set({ exclude_keywords: exclude.filter((x) => x !== k) })}>
                not {k}
              </FilterChip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FoundedPanel({ filters, set }: { filters: DirectoryFilters; set: (p: Partial<DirectoryFilters>) => void }) {
  const year = new Date().getFullYear();
  const num = (v: string) => (v.trim() ? Math.max(1800, Math.min(year, Number(v))) : null);
  const presets = [
    { label: "Last 5 years", after: year - 5 },
    { label: "Last 10 years", after: year - 10 },
    { label: "Before 2000", before: 1999 },
  ];
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-label">Year the firm was founded</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="From"
          defaultValue={filters.founded_after ?? ""}
          onBlur={(e) => set({ founded_after: num(e.target.value) })}
          className="h-8 w-full rounded-[5px] border border-line bg-panel-2 px-2 text-[13px] focus:border-[#ae9d92] focus:outline-none"
        />
        <span className="text-label">to</span>
        <input
          type="number"
          placeholder="To"
          defaultValue={filters.founded_before ?? ""}
          onBlur={(e) => set({ founded_before: num(e.target.value) })}
          className="h-8 w-full rounded-[5px] border border-line bg-panel-2 px-2 text-[13px] focus:border-[#ae9d92] focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => set({ founded_after: p.after ?? null, founded_before: p.before ?? null })}
            className="rounded-[5px] border border-line px-2 py-0.5 text-[12px] text-muted hover:border-[#d5c8ba] hover:text-ink"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Every applied filter as a removable chip, so stacked filters are always visible. */
function ActiveFilters({ filters, set, clear }: { filters: DirectoryFilters; set: (p: Partial<DirectoryFilters>) => void; clear: () => void }) {
  const chips: { key: string; text: string; remove: () => void; tone?: "exclude" }[] = [];
  const list = (k: keyof DirectoryFilters, map: Record<string, string> | null, prefix = "") => {
    const values = (filters[k] as string[] | undefined) ?? [];
    for (const v of values) chips.push({ key: `${k}:${v}`, text: prefix + (map ? label(map, v) : v), remove: () => set({ [k]: values.filter((x) => x !== v) }) });
  };
  if (filters.q?.trim()) chips.push({ key: "q", text: `"${filters.q.trim()}"`, remove: () => set({ q: "" }) });
  list("types", INVESTOR_TYPES);
  list("stages", STAGES);
  list("sectors", SECTORS);
  list("regions", REGIONS);
  list("countries", null);
  list("cities", null);
  list("roles", ROLES);
  list("firm_size", FIRM_SIZES, "Firm ");
  list("firm_funding", FIRM_FUNDING, "Raised ");
  list("values", VALUES);
  list("has", HAS, "Has ");
  list("keywords", null, (filters.keyword_mode === "all" ? "all: " : ""));
  for (const k of filters.exclude_keywords ?? [])
    chips.push({ key: `x:${k}`, text: `not ${k}`, tone: "exclude", remove: () => set({ exclude_keywords: (filters.exclude_keywords ?? []).filter((x) => x !== k) }) });
  if (filters.founded_after || filters.founded_before)
    chips.push({
      key: "founded",
      text: `Founded ${filters.founded_after ?? "any"} to ${filters.founded_before ?? "now"}`,
      remove: () => set({ founded_after: null, founded_before: null }),
    });
  if (filters.status && filters.status !== "any") chips.push({ key: "status", text: STATUS[filters.status], remove: () => set({ status: "any" }) });
  if (filters.min_score) chips.push({ key: "score", text: `Fit ${filters.min_score}+`, remove: () => set({ min_score: 0 }) });
  if (filters.picks_only) chips.push({ key: "picks", text: "Claude picks", remove: () => set({ picks_only: false }) });
  if (filters.saved_only) chips.push({ key: "saved", text: "Saved", remove: () => set({ saved_only: false }) });

  if (!chips.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12px] text-label">Showing investors who match all of</span>
      {chips.map((c) => (
        <FilterChip key={c.key} onRemove={c.remove} tone={c.tone}>
          {c.text}
        </FilterChip>
      ))}
      <button onClick={clear} className="px-2 text-[12.5px] text-label hover:text-ink">
        Clear all
      </button>
    </div>
  );
}

function Directory({ initial, directorySize }: { initial: DirectoryState; directorySize: number | null }) {
  const toast = useToast();
  const [filters, setFilters] = useState<DirectoryFilters>(initial.filters);
  const [q, setQ] = useState(initial.filters.q ?? "");
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [dir, setDir] = useState(initial.dir);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Map<string, DirectoryRow>>(new Map());
  const [open, setOpen] = useState<DirectoryRow | null>(null);
  const [composeFor, setComposeFor] = useState<DirectoryRow | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [matching, setMatching] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);

  const { rows, total, loading, error, reload, patchRow } = useDirectory(filters, sort, dir, page, pageSize);
  const { facets, reload: reloadFacets } = useFacets(filters);

  const set = useCallback((p: Partial<DirectoryFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(0);
  }, []);

  // Search waits for a pause in typing.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? "") !== q) set({ q });
    }, 280);
    return () => clearTimeout(t);
  }, [q, filters.q, set]);

  useEffect(() => saveDirectoryState({ filters, sort, dir, pageSize }), [filters, sort, dir, pageSize]);

  const clearAll = () => {
    setQ("");
    setFilters((f) => ({ one_per_firm: f.one_per_firm }));
    setPage(0);
  };

  const onSort = (k: SortKey) => {
    setDir((d) => (sort === k ? (d === "asc" ? "desc" : "asc") : k === "name" || k === "firm" || k === "location" ? "asc" : "desc"));
    setSort(k);
    setPage(0);
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

  async function selectAllMatching() {
    setSelectingAll(true);
    try {
      const { rows: all } = await fetchAllMatching(filters, sort, dir);
      setSelected(new Map(all.slice(0, BATCH_LIMIT).map((r) => [r.id, r])));
      if (all.length > BATCH_LIMIT) toast({ title: `Selected the first ${BATCH_LIMIT}`, body: "Batches go out in groups of 50 so each email can be checked." });
    } finally {
      setSelectingAll(false);
    }
  }

  async function onSave(r: DirectoryRow) {
    patchRow(r.id, { saved: !r.saved });
    if (open?.id === r.id) setOpen({ ...r, saved: !r.saved });
    try {
      await toggleSaved(r.id, r.saved);
    } catch {
      patchRow(r.id, { saved: r.saved });
      toast({ title: "Could not update saved investors", tone: "error" });
    }
  }

  async function refreshPicks() {
    setMatching(true);
    try {
      const res = await callFunction<{ count: number }>("match-investors", {});
      toast({ title: `${res.count} Claude picks ready`, body: "Sorted by fit. Turn on Claude picks to see only them." });
      void reload();
      void reloadFacets();
    } catch (err) {
      toast({ title: "Could not refresh picks", body: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setMatching(false);
    }
  }

  const f: Partial<Facets> = facets ?? {};
  const anyFilter = hasFilters(filters);
  const from = total ? page * pageSize + 1 : 0;
  const to = Math.min((page + 1) * pageSize, total ?? 0);
  const pages = total ? Math.ceil(total / pageSize) : 1;
  const selectedRows = useMemo(() => [...selected.values()], [selected]);

  return (
    <div className="px-4 py-6 pb-28 md:px-6">
      <Settle className="relative z-30 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[26px] tracking-[-0.04em]">Investor database</h2>
          <p className="mt-1 text-[14px] text-muted">
            {total == null ? (
              <Skeleton className="inline-block h-3 w-52 align-middle" />
            ) : (
              <>
                <span className="tabular font-medium text-ink">{total.toLocaleString("en-GB")}</span> {anyFilter ? "match your filters" : "investors"}
                {directorySize ? `, from ${directorySize.toLocaleString("en-GB")} in the directory` : ""}.
              </>
            )}{" "}
            Fit is scored against your startup profile.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Hand className="hidden text-[20px] lg:block" tilt={-2}>
            filters stack, every chip must match
          </Hand>
          <Button size="sm" onClick={() => void refreshPicks()} disabled={matching}>
            <Sparkles className={cn("h-3.5 w-3.5 text-vermilion", matching && "animate-pulse")} />
            {matching ? "Matching" : "Refresh Claude picks"}
          </Button>
          <ExportMenu total={total} selected={selectedRows} fetchMatching={(p) => fetchAllMatching(filters, sort, dir, p).then((r) => r.rows)} />
        </div>
      </Settle>

      <Settle delay={60} className="relative z-20 mt-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-label" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, firm, email, focus"
            className="h-8 w-[260px] rounded-[6px] border border-line bg-panel pl-8 pr-7 text-[13px] text-ink shadow-[0_1px_0_rgba(57,28,37,0.03)] placeholder:text-faint focus:border-[#ae9d92] focus:outline-none"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-label hover:text-ink" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Toggle on={Boolean(filters.picks_only)} onClick={() => set({ picks_only: !filters.picks_only })}>
          Claude picks{f.picks != null ? ` ${f.picks}` : ""}
        </Toggle>
        <Toggle on={Boolean(filters.saved_only)} onClick={() => set({ saved_only: !filters.saved_only })}>
          Saved{f.saved != null ? ` ${f.saved}` : ""}
        </Toggle>
        <Toggle on={Boolean(filters.one_per_firm)} onClick={() => set({ one_per_firm: !filters.one_per_firm })}>
          One per firm
        </Toggle>
      </Settle>

      <Settle delay={90} className="relative z-10 mt-2 flex flex-wrap items-center gap-2">
        <FilterMenu label="Type" selected={filters.types ?? []} onChange={(v) => set({ types: v })} options={options(INVESTOR_TYPES, f.types)} />
        <FilterMenu label="Stage" selected={filters.stages ?? []} onChange={(v) => set({ stages: v })} options={options(STAGES, f.stages)} />
        <FilterMenu label="Sector" selected={filters.sectors ?? []} onChange={(v) => set({ sectors: v })} options={options(SECTORS, f.sectors)} searchable />
        <GroupedMenu
          label="Location"
          hint="Any ticked place matches."
          sections={[
            { title: "Regions", options: options(REGIONS, f.regions), selected: filters.regions ?? [], onChange: (v) => set({ regions: v }) },
            { title: "Countries", options: countOptions(f.countries, filters.countries ?? []), selected: filters.countries ?? [], onChange: (v) => set({ countries: v }) },
            { title: "Cities", options: countOptions(f.cities, filters.cities ?? []), selected: filters.cities ?? [], onChange: (v) => set({ cities: v }) },
          ]}
        />
        <FilterMenu
          label="Role"
          selected={filters.roles ?? []}
          onChange={(v) => set({ roles: v })}
          options={options(ROLES, f.roles)}
          hint="Investor relations and LPs are hidden unless you tick them."
        />
        <PanelMenu label="Keywords" count={(filters.keywords?.length ?? 0) + (filters.exclude_keywords?.length ?? 0)}>
          <KeywordPanel filters={filters} set={set} />
        </PanelMenu>
        <FilterMenu label="Firm size" selected={filters.firm_size ?? []} onChange={(v) => set({ firm_size: v })} options={options(FIRM_SIZES, f.firm_size)} />
        <FilterMenu label="Firm raised" selected={filters.firm_funding ?? []} onChange={(v) => set({ firm_funding: v })} options={options(FIRM_FUNDING, f.firm_funding)} />
        <PanelMenu label="Founded" count={(filters.founded_after ? 1 : 0) + (filters.founded_before ? 1 : 0)} width={250}>
          <FoundedPanel filters={filters} set={set} />
        </PanelMenu>
        <FilterMenu label="Values" selected={filters.values ?? []} onChange={(v) => set({ values: v })} options={options(VALUES, f.values)} />
        <FilterMenu
          label="Contact data"
          selected={filters.has ?? []}
          onChange={(v) => set({ has: v })}
          options={options(HAS, f.has)}
          hint="Ticked items must all be present. Every investor has an email."
        />
        <ChoiceMenu<ContactStatus>
          label="Status"
          value={filters.status ?? "any"}
          isDefault={!filters.status || filters.status === "any"}
          onChange={(v) => set({ status: v })}
          options={(Object.keys(STATUS) as ContactStatus[]).map((k) => ({ value: k, label: STATUS[k], count: f.status?.[k] }))}
        />
        <ChoiceMenu<number>
          label="Fit"
          value={filters.min_score ?? 0}
          isDefault={!filters.min_score}
          onChange={(v) => set({ min_score: v })}
          options={MIN_SCORES}
        />
      </Settle>

      <ActiveFilters filters={filters} set={set} clear={clearAll} />

      <Settle delay={120} className="mt-4">
        <Card className="overflow-hidden">
          <InvestorTable
            rows={rows ?? []}
            loading={loading}
            sort={sort}
            dir={dir}
            onSort={onSort}
            onOpen={setOpen}
            onSave={(r) => void onSave(r)}
            onEmail={setComposeFor}
            selected={selected}
            onSelect={toggleSelect}
            onSelectPage={selectPage}
          />
          {error && (
            <Empty title="Could not load investors" body={error} action={<Button size="sm" onClick={() => void reload()}>Try again</Button>} />
          )}
          {!error && !loading && rows?.length === 0 && (
            <Empty
              title="No investors match every filter"
              body="Filters stack, so each one narrows the list. Remove a chip above to widen it."
              action={<Button size="sm" onClick={clearAll}>Clear filters</Button>}
            />
          )}
          {!!total && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 px-4 py-2.5 text-[12.5px] text-label">
              <span className="tabular">
                {from.toLocaleString("en-GB")} to {to.toLocaleString("en-GB")} of {total.toLocaleString("en-GB")}
              </span>
              <div className="flex items-center gap-2">
                <Select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                  className="h-8 w-[118px] text-[12.5px]"
                  aria-label="Rows per page"
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} per page
                    </option>
                  ))}
                </Select>
                <Button size="sm" square={false} disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="tabular min-w-[92px] text-center">
                  Page {page + 1} of {pages.toLocaleString("en-GB")}
                </span>
                <Button size="sm" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
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
            className="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-[min(720px,calc(100%-32px))] flex-wrap items-center gap-2 rounded-[10px] border border-night bg-night px-4 py-2.5 text-ivory shadow-[0_20px_50px_-20px_rgba(57,28,37,0.6)]"
          >
            <span className="tabular text-[13.5px] font-medium">{selected.size} selected</span>
            {total != null && total > selected.size && selected.size < BATCH_LIMIT && (
              <button onClick={() => void selectAllMatching()} disabled={selectingAll} className="text-[12.5px] text-ivory/70 underline-offset-2 hover:text-ivory hover:underline">
                {selectingAll ? "Selecting" : `Select ${Math.min(total, BATCH_LIMIT)} matching`}
              </button>
            )}
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={async () => {
                  const unsaved = selectedRows.filter((r) => !r.saved);
                  for (const r of unsaved) patchRow(r.id, { saved: true });
                  try {
                    await Promise.all(unsaved.map((r) => toggleSaved(r.id, false)));
                    toast({ title: `Saved ${unsaved.length} investor${unsaved.length === 1 ? "" : "s"}` });
                    void reloadFacets();
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
                onClick={() => setBatchOpen(true)}
                disabled={selected.size > BATCH_LIMIT}
                className="flex h-8 items-center gap-1.5 rounded-[6px] bg-vermilion px-3 text-[13px] font-medium text-ivory hover:brightness-105 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> Queue emails
              </button>
              <button onClick={() => setSelected(new Map())} className="rounded-[6px] p-1.5 text-ivory/70 hover:text-ivory" aria-label="Clear selection">
                <X className="h-4 w-4" />
              </button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <Drawer open={!!open} onClose={() => setOpen(null)}>
        {open && (
          <InvestorDrawerBody
            row={open}
            onEmail={() => setComposeFor(open)}
            onSave={() => void onSave(open)}
            selected={selected.has(open.id)}
            onSelect={() => toggleSelect(open)}
            onKeyword={(k) => {
              set({ keywords: [...new Set([...(filters.keywords ?? []), k])] });
              setOpen(null);
              toast({ title: `Filtering by "${k}"` });
            }}
          />
        )}
      </Drawer>

      <ComposeModal
        investor={composeFor}
        onClose={() => setComposeFor(null)}
        onSent={() => {
          void reload();
          void reloadFacets();
          setOpen(null);
        }}
      />

      <BatchComposer
        rows={selectedRows}
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        onQueued={() => {
          setSelected(new Map());
          void reload();
          void reloadFacets();
        }}
      />
    </div>
  );
}

export default function InvestorsPage() {
  // Filters are restored from this browser session after mount, so the server render never disagrees with it.
  const [initial, setInitial] = useState<DirectoryState | null>(null);
  const [directorySize, setDirectorySize] = useState<number | null>(null);

  useEffect(() => {
    setInitial({ ...DEFAULT_STATE, ...loadDirectoryState() });
    void createClient()
      .from("investors")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .then(({ count }) => setDirectorySize(count ?? null));
  }, []);

  if (!initial) {
    return (
      <div className="px-4 py-6 md:px-6">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-3.5 w-80" />
        <div className="mt-6 flex gap-2">
          {[260, 110, 70, 110, 70, 70, 90].map((w, i) => (
            <Skeleton key={i} className="h-8" style={{ width: w }} />
          ))}
        </div>
        <Skeleton className="mt-4 h-[480px] w-full rounded-[10px]" />
      </div>
    );
  }
  return <Directory initial={{ ...initial, filters: cleanFilters(initial.filters) }} directorySize={directorySize} />;
}
