"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, Download, Globe, Mail, MessageCircle, Phone, Search, Star } from "lucide-react";
import { ComposeModal } from "@/components/app/compose";
import { FilterMenu, Toggle } from "@/components/app/filter-menu";
import { Button } from "@/components/ui/button";
import { Avatar, Card, Drawer, Empty, Pill, Settle, Skeleton } from "@/components/ui/kit";
import { ValueIcon } from "@/components/onboarding/icons";
import { Hand } from "@/components/sketch/hand";
import { regionOf, useInvestors, type InvestorRow } from "@/lib/data";
import { INVESTOR_TYPES, label, REVENUE, SECTORS, STAGES, VALUES } from "@/lib/taxonomy";
import { chequeRange, cn, money } from "@/lib/utils";
import { downloadInvestorsCsv } from "@/lib/export";

type SortKey = "score" | "name" | "cheque" | "fund";
const CHEQUE_BANDS = [
  { value: "small", label: "Up to $100k", test: (i: InvestorRow) => (i.check_min_usd ?? 0) <= 100_000 },
  { value: "mid", label: "$100k to $1m", test: (i: InvestorRow) => (i.check_max_usd ?? 0) >= 100_000 && (i.check_min_usd ?? 0) <= 1_000_000 },
  { value: "large", label: "Over $1m", test: (i: InvestorRow) => (i.check_max_usd ?? 0) > 1_000_000 },
];

function FitBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-line-3">
        <div className={cn("h-full rounded-full", score >= 60 ? "bg-burgundy" : score >= 40 ? "bg-[#a8968c]" : "bg-[#d5c8ba]")} style={{ width: `${score}%` }} />
      </div>
      <span className="tabular w-6 text-right text-[12.5px] font-medium text-ink">{score}</span>
    </div>
  );
}

function Status({ r }: { r: InvestorRow }) {
  if (r.replied) return <Pill tone="green">Replied</Pill>;
  if (r.opened) return <Pill tone="amber">Opened</Pill>;
  if (r.contacted) return <Pill tone="burgundy">Contacted</Pill>;
  return <span className="text-[12px] text-faint">Not contacted</span>;
}

function Chips({ items, map, max = 2 }: { items: string[]; map: Record<string, string>; max?: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, max).map((s) => (
        <span key={s} className="whitespace-nowrap rounded-[4px] border border-line-2 bg-panel-2 px-1.5 py-px text-[11.5px] text-muted">
          {label(map, s)}
        </span>
      ))}
      {items.length > max && <span className="text-[11.5px] text-label">+{items.length - max}</span>}
    </div>
  );
}

type Sort = { key: SortKey; dir: 1 | -1 };

function Th({ k, sort, onSort, children, className }: { k?: SortKey; sort: Sort; onSort: (k: SortKey) => void; children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("sticky top-0 z-10 border-b border-r border-line bg-[#faf6ef] px-3 py-2 text-left text-[12px] font-medium text-ink last:border-r-0", className)}>
      {k ? (
        <button className="inline-flex items-center gap-1 hover:text-vermilion" onClick={() => onSort(k)}>
          {children}
          <ArrowDownUp className={cn("h-3 w-3", sort.key === k ? "text-vermilion" : "text-faint")} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export default function InvestorsPage() {
  const { rows, toggleSave, reload } = useInvestors();
  const [q, setQ] = useState("");
  const [stages, setStages] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [values, setValues] = useState<string[]>([]);
  const [cheques, setCheques] = useState<string[]>([]);
  const [bestFit, setBestFit] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [leads, setLeads] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: "score", dir: -1 });
  const onSort = (k: SortKey) => setSort((s) => ({ key: k, dir: s.key === k ? ((s.dir * -1) as 1 | -1) : k === "name" ? 1 : -1 }));
  const [open, setOpen] = useState<InvestorRow | null>(null);
  const [composeFor, setComposeFor] = useState<InvestorRow | null>(null);

  const count = (fn: (r: InvestorRow) => boolean) => (rows ?? []).filter(fn).length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => {
      if (needle && ![r.full_name, r.firm, r.thesis, r.focus_note, ...r.portfolio].join(" ").toLowerCase().includes(needle)) return false;
      if (stages.length && !r.stages.some((s) => stages.includes(s))) return false;
      if (sectors.length && !r.sectors.some((s) => sectors.includes(s))) return false;
      if (types.length && !types.includes(r.investor_type)) return false;
      if (regions.length && !regions.includes(regionOf(r.location))) return false;
      if (values.length && !r.values.some((v) => values.includes(v))) return false;
      if (cheques.length && !CHEQUE_BANDS.filter((b) => cheques.includes(b.value)).some((b) => b.test(r))) return false;
      if (bestFit && r.score < 60) return false;
      if (savedOnly && !r.saved) return false;
      if (leads && !r.leads_rounds) return false;
      return true;
    });
    const val = (r: InvestorRow) =>
      sort.key === "score" ? r.score : sort.key === "name" ? r.full_name : sort.key === "cheque" ? r.check_max_usd ?? 0 : r.fund_size_usd ?? 0;
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, q, stages, sectors, types, regions, values, cheques, bestFit, savedOnly, leads, sort]);

  const anyFilter = q || stages.length || sectors.length || types.length || regions.length || values.length || cheques.length || bestFit || savedOnly || leads;
  const clearAll = () => {
    setQ("");
    setStages([]);
    setSectors([]);
    setTypes([]);
    setRegions([]);
    setValues([]);
    setCheques([]);
    setBestFit(false);
    setSavedOnly(false);
    setLeads(false);
  };

  return (
    <div className="px-4 py-6 md:px-6">
      <Settle className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[26px] tracking-[-0.04em]">Investor database</h2>
          <p className="mt-1 text-[14px] text-muted">
            {rows ? `${filtered.length} of ${rows.length} investors shown.` : "Loading investors."} Fit is scored against your startup profile.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Hand className="hidden text-[20px] md:block" tilt={-2}>
            sector 30, stage 20, values 15, revenue 10
          </Hand>
          <Button size="sm" disabled={!rows || filtered.length === 0} onClick={() => downloadInvestorsCsv(filtered)}>
            <Download className="h-3.5 w-3.5" /> Export {rows ? filtered.length : ""} to CSV
          </Button>
        </div>
      </Settle>

      <Settle delay={60} className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-label" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, firm, thesis, portfolio"
            className="h-8 w-[260px] rounded-[6px] border border-line bg-panel pl-8 pr-3 text-[13px] text-ink shadow-[0_1px_0_rgba(57,28,37,0.03)] placeholder:text-faint focus:border-[#ae9d92] focus:outline-none"
          />
        </div>
        <FilterMenu label="Stage" selected={stages} onChange={setStages} options={Object.entries(STAGES).map(([v, l]) => ({ value: v, label: l, count: count((r) => r.stages.includes(v)) }))} />
        <FilterMenu label="Sector" selected={sectors} onChange={setSectors} options={Object.entries(SECTORS).map(([v, l]) => ({ value: v, label: l, count: count((r) => r.sectors.includes(v)) })).filter((o) => o.count)} />
        <FilterMenu label="Type" selected={types} onChange={setTypes} options={Object.entries(INVESTOR_TYPES).map(([v, l]) => ({ value: v, label: l, count: count((r) => r.investor_type === v) }))} />
        <FilterMenu label="Location" selected={regions} onChange={setRegions} options={["UK", "US", "Europe"].map((v) => ({ value: v, label: v, count: count((r) => regionOf(r.location) === v) }))} />
        <FilterMenu label="Cheque size" selected={cheques} onChange={setCheques} options={CHEQUE_BANDS.map((b) => ({ value: b.value, label: b.label, count: count(b.test) }))} />
        <FilterMenu label="Values" selected={values} onChange={setValues} options={Object.entries(VALUES).map(([v, l]) => ({ value: v, label: l, count: count((r) => r.values.includes(v)) })).filter((o) => o.count)} />
        <Toggle on={bestFit} onClick={() => setBestFit((v) => !v)}>
          Best fit
        </Toggle>
        <Toggle on={leads} onClick={() => setLeads((v) => !v)}>
          Leads rounds
        </Toggle>
        <Toggle on={savedOnly} onClick={() => setSavedOnly((v) => !v)}>
          Saved
        </Toggle>
        {anyFilter ? (
          <button onClick={clearAll} className="px-2 text-[12.5px] text-label hover:text-ink">
            Clear all
          </button>
        ) : null}
      </Settle>

      <Settle delay={120} className="mt-4">
        <Card className="overflow-hidden">
          <div className="quiet-scroll overflow-x-auto">
            <table className="w-full min-w-[1320px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <Th className="w-10 px-0 text-center" sort={sort} onSort={onSort}>
                    <Star className="mx-auto h-3.5 w-3.5 text-label" />
                  </Th>
                  <Th k="name" sort={sort} onSort={onSort}>Investor</Th>
                  <Th sort={sort} onSort={onSort}>Firm</Th>
                  <Th sort={sort} onSort={onSort}>Type</Th>
                  <Th sort={sort} onSort={onSort}>Stages</Th>
                  <Th sort={sort} onSort={onSort}>Sectors</Th>
                  <Th k="cheque" sort={sort} onSort={onSort}>Cheque</Th>
                  <Th k="fund" sort={sort} onSort={onSort}>Fund size</Th>
                  <Th sort={sort} onSort={onSort}>Location</Th>
                  <Th k="score" sort={sort} onSort={onSort}>Fit</Th>
                  <Th sort={sort} onSort={onSort}>Status</Th>
                  <Th className="w-[92px]" sort={sort} onSort={onSort}> </Th>
                </tr>
              </thead>
              <tbody>
                {!rows
                  ? Array.from({ length: 8 }, (_, i) => (
                      <tr key={i}>
                        <td colSpan={12} className="border-b border-line-2 px-3 py-2.5">
                          <Skeleton className="h-6 w-full" />
                        </td>
                      </tr>
                    ))
                  : filtered.map((r) => (
                      <tr key={r.id} onClick={() => setOpen(r)} className="group cursor-pointer hover:bg-[#fbf7f1]">
                        <td className="border-b border-r border-line-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => void toggleSave(r.id, r.saved)} className="p-2" aria-label={r.saved ? "Unsave" : "Save"}>
                            <Star className={cn("h-4 w-4 transition-colors", r.saved ? "fill-vermilion text-vermilion" : "text-faint hover:text-muted")} strokeWidth={1.8} />
                          </button>
                        </td>
                        <td className="border-b border-r border-line-2 px-3 py-2">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={r.full_name} />
                            <div className="whitespace-nowrap leading-tight">
                              <p className="font-medium text-ink">{r.full_name}</p>
                              <p className="text-[12px] text-label">{r.title}</p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap border-b border-r border-line-2 px-3 py-2 text-ink">{r.firm}</td>
                        <td className="border-b border-r border-line-2 px-3 py-2 text-muted">{label(INVESTOR_TYPES, r.investor_type)}</td>
                        <td className="border-b border-r border-line-2 px-3 py-2">
                          <Chips items={r.stages} map={STAGES} max={2} />
                        </td>
                        <td className="border-b border-r border-line-2 px-3 py-2">
                          <Chips items={r.sectors} map={SECTORS} max={2} />
                        </td>
                        <td className="tabular whitespace-nowrap border-b border-r border-line-2 px-3 py-2 text-muted">{chequeRange(r.check_min_usd, r.check_max_usd)}</td>
                        <td className="tabular border-b border-r border-line-2 px-3 py-2 text-muted">{r.fund_size_usd ? money(r.fund_size_usd) : "Personal"}</td>
                        <td className="whitespace-nowrap border-b border-r border-line-2 px-3 py-2 text-muted">{r.location}</td>
                        <td className="border-b border-r border-line-2 px-3 py-2">
                          <FitBar score={r.score} />
                        </td>
                        <td className="border-b border-r border-line-2 px-3 py-2">
                          <Status r={r} />
                        </td>
                        <td className="border-b border-line-2 px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" onClick={() => setComposeFor(r)}>
                            <Mail className="h-3.5 w-3.5" /> Email
                          </Button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {rows && filtered.length === 0 && <Empty title="No investors match these filters" action={<Button size="sm" onClick={clearAll}>Clear filters</Button>} />}
        </Card>
      </Settle>

      <Drawer open={!!open} onClose={() => setOpen(null)}>
        {open && (
          <div className="pb-10">
            <div className="graph-paper-faint border-b border-line px-6 pb-5 pt-6">
              <div className="flex items-center gap-3">
                <Avatar name={open.full_name} className="h-11 w-11 text-[14px]" />
                <div>
                  <h3 className="text-[20px] tracking-[-0.03em]">{open.full_name}</h3>
                  <p className="text-[13px] text-muted">
                    {open.title}, {open.firm}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <p className="text-[12px] text-label">Fit with your startup</p>
                  <p className="display tabular text-[40px] leading-none tracking-[-0.05em] text-display">{open.score}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {open.reasons.map((x) => (
                    <Pill key={x} tone="green">
                      {x}
                    </Pill>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex gap-2">
                <Button variant="primary" size="sm" onClick={() => setComposeFor(open)}>
                  <Mail className="h-3.5 w-3.5" /> Draft intro email
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    void toggleSave(open.id, open.saved);
                    setOpen({ ...open, saved: !open.saved });
                  }}
                >
                  <Star className={cn("h-3.5 w-3.5", open.saved && "fill-vermilion text-vermilion")} /> {open.saved ? "Saved" : "Save"}
                </Button>
              </div>
            </div>

            <div className="space-y-6 px-6 pt-6">
              <section>
                <p className="text-[12px] text-label">Thesis</p>
                <p className="mt-1.5 border-l-2 border-vermilion/60 pl-3 text-[14.5px] leading-relaxed text-body">{open.thesis}</p>
              </section>
              {open.focus_note && (
                <section className="rounded-[6px] border border-[#ecdcbf] bg-amber-soft/70 px-3 py-2.5 text-[13.5px] text-body">
                  <span className="font-semibold text-amber">Focus</span> {open.focus_note}
                </section>
              )}
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-[13.5px]">
                {[
                  ["Type", label(INVESTOR_TYPES, open.investor_type)],
                  ["Location", open.location],
                  ["Cheque size", chequeRange(open.check_min_usd, open.check_max_usd)],
                  ["Fund size", open.fund_size_usd ? money(open.fund_size_usd) : "Invests personally"],
                  ["Leads rounds", open.leads_rounds ? "Yes" : "Follows"],
                  ["Minimum revenue", open.min_revenue_band ? label(REVENUE, open.min_revenue_band) : "None stated"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[12px] text-label">{k}</dt>
                    <dd className="mt-0.5 text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <section>
                <p className="text-[12px] text-label">Stages</p>
                <div className="mt-1.5">
                  <Chips items={open.stages} map={STAGES} max={9} />
                </div>
              </section>
              <section>
                <p className="text-[12px] text-label">Sectors</p>
                <div className="mt-1.5">
                  <Chips items={open.sectors} map={SECTORS} max={9} />
                </div>
              </section>
              <section>
                <p className="text-[12px] text-label">Portfolio</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {open.portfolio.map((p) => (
                    <span key={p} className="rounded-[5px] border border-line bg-panel px-2 py-0.5 text-[12.5px] text-ink">
                      {p}
                    </span>
                  ))}
                </div>
              </section>
              {open.values.length > 0 && (
                <section>
                  <p className="text-[12px] text-label">Values</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {open.values.map((v) => (
                      <span key={v} className="flex items-center gap-1.5 text-[13px] text-ink">
                        <span className="scale-75">
                          <ValueIcon value={v} active />
                        </span>
                        {label(VALUES, v)}
                      </span>
                    ))}
                  </div>
                </section>
              )}
              <section className="rounded-[8px] border border-line">
                <p className="border-b border-line-2 px-4 py-2 text-[12px] text-label">Contact</p>
                <div className="divide-y divide-line-2 text-[13.5px]">
                  <a href={`mailto:${open.email}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-black/[0.02]">
                    <Mail className="h-4 w-4 text-label" /> {open.email}
                  </a>
                  {open.phone && (
                    <div className="flex items-center gap-2.5 px-4 py-2.5">
                      <Phone className="h-4 w-4 text-label" /> {open.phone}
                      <a
                        href={`https://wa.me/${open.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 rounded-[5px] border border-line px-2 py-0.5 text-[12px] text-green hover:border-green/40"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    </div>
                  )}
                  {open.website_url && (
                    <div className="flex items-center gap-2.5 px-4 py-2.5 text-muted">
                      <Globe className="h-4 w-4 text-label" /> {open.website_url.replace(/^https?:\/\//, "")}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </Drawer>

      <ComposeModal
        investor={composeFor}
        onClose={() => setComposeFor(null)}
        onSent={() => {
          void reload();
          setOpen(null);
        }}
      />
    </div>
  );
}
