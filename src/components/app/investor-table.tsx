"use client";

import type { ReactNode } from "react";
import { ArrowDownUp, Mail, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Pill, Skeleton } from "@/components/ui/kit";
import type { InvestorRow } from "@/lib/data";
import { INVESTOR_TYPES, label, SECTORS, STAGES, VALUES } from "@/lib/taxonomy";
import { chequeRange, cn, money } from "@/lib/utils";

export type SortKey = "score" | "name" | "cheque" | "fund";
export type Sort = { key: SortKey; dir: 1 | -1 };

// Every cell is one line: nowrap, fixed row height, the table scrolls sideways instead.
const cellBase = "h-12 whitespace-nowrap border-b border-r border-line-2 px-3 align-middle";
const stickyBody = "sticky z-[1] bg-panel group-hover:bg-[#fbf7f1]";
const stickyHead = "sticky z-[2] bg-[#faf6ef]";
// Soft edges on the pinned columns so scrolled content visibly slides underneath.
const pinnedLeft = "shadow-[8px_0_10px_-10px_rgba(57,28,37,0.28)]";
const pinnedRight = "shadow-[-8px_0_10px_-10px_rgba(57,28,37,0.28)]";

function Chips({ items, map }: { items: string[]; map: Record<string, string> }) {
  if (!items.length) return <span className="text-[12px] text-faint">None</span>;
  return (
    <div className="flex flex-nowrap gap-1">
      {items.map((s) => (
        <span key={s} className="rounded-[4px] border border-line-2 bg-panel-2 px-1.5 py-px text-[11.5px] text-muted">
          {label(map, s)}
        </span>
      ))}
    </div>
  );
}

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

type Column = {
  id: string;
  header: ReactNode;
  sort?: SortKey;
  className?: string;
  headClassName?: string;
  cell: (r: InvestorRow) => ReactNode;
  skeleton: ReactNode;
};

const bar = (w: number) => <Skeleton className="h-3" style={{ width: w }} />;
const chipBars = (...ws: number[]) => (
  <div className="flex gap-1">
    {ws.map((w, i) => (
      <Skeleton key={i} className="h-[18px]" style={{ width: w }} />
    ))}
  </div>
);

const COLUMNS: Column[] = [
  {
    id: "investor",
    header: "Investor",
    sort: "name",
    className: cn(stickyBody, pinnedLeft, "left-11 min-w-[210px]"),
    headClassName: cn(stickyHead, pinnedLeft, "left-11"),
    cell: (r) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={r.full_name} className="h-6 w-6 text-[10px]" />
        <span className="font-medium text-ink">{r.full_name}</span>
      </div>
    ),
    skeleton: (
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-6 w-6 rounded-[6px]" />
        {bar(104)}
      </div>
    ),
  },
  { id: "title", header: "Title", className: "text-muted", cell: (r) => r.title, skeleton: bar(92) },
  { id: "firm", header: "Firm", className: "text-ink", cell: (r) => r.firm, skeleton: bar(140) },
  { id: "type", header: "Type", className: "text-muted", cell: (r) => label(INVESTOR_TYPES, r.investor_type), skeleton: bar(48) },
  { id: "stages", header: "Stages", cell: (r) => <Chips items={r.stages} map={STAGES} />, skeleton: chipBars(58, 40) },
  { id: "sectors", header: "Sectors", cell: (r) => <Chips items={r.sectors} map={SECTORS} />, skeleton: chipBars(84, 112, 70) },
  {
    id: "cheque",
    header: "Cheque",
    sort: "cheque",
    className: "tabular text-muted",
    cell: (r) => chequeRange(r.check_min_usd, r.check_max_usd),
    skeleton: bar(96),
  },
  {
    id: "fund",
    header: "Fund size",
    sort: "fund",
    className: "tabular text-muted",
    cell: (r) => (r.fund_size_usd ? money(r.fund_size_usd) : "Personal"),
    skeleton: bar(52),
  },
  { id: "location", header: "Location", className: "text-muted", cell: (r) => r.location, skeleton: bar(96) },
  { id: "leads", header: "Leads rounds", className: "text-muted", cell: (r) => (r.leads_rounds ? "Leads" : "Follows"), skeleton: bar(48) },
  { id: "values", header: "Values", cell: (r) => <Chips items={r.values} map={VALUES} />, skeleton: chipBars(72) },
  { id: "fit", header: "Fit", sort: "score", cell: (r) => <FitBar score={r.score} />, skeleton: bar(88) },
  { id: "status", header: "Status", cell: (r) => <Status r={r} />, skeleton: bar(76) },
];

export function InvestorTable({
  rows,
  loading,
  sort,
  onSort,
  onOpen,
  onSave,
  onEmail,
}: {
  rows: InvestorRow[];
  loading: boolean;
  sort: Sort;
  onSort: (k: SortKey) => void;
  onOpen: (r: InvestorRow) => void;
  onSave: (r: InvestorRow) => void;
  onEmail: (r: InvestorRow) => void;
}) {
  return (
    <div className="quiet-scroll overflow-x-auto">
      <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th className={cn(cellBase, stickyHead, "left-0 w-11 border-line px-0 text-center")}>
              <Star className="mx-auto h-3.5 w-3.5 text-label" />
            </th>
            {COLUMNS.map((c) => (
              <th key={c.id} className={cn(cellBase, "h-10 border-line bg-[#faf6ef] text-left text-[12px] font-medium text-ink", c.headClassName)}>
                {c.sort ? (
                  <button className="inline-flex items-center gap-1 hover:text-vermilion" onClick={() => onSort(c.sort!)}>
                    {c.header}
                    <ArrowDownUp className={cn("h-3 w-3", sort.key === c.sort ? "text-vermilion" : "text-faint")} />
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
            <th className={cn(cellBase, stickyHead, pinnedRight, "right-0 h-10 w-[96px] border-r-0 border-l border-line")} />
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 9 }, (_, i) => (
                <tr key={i} className="group">
                  <td className={cn(cellBase, stickyBody, "left-0 px-0")}>
                    <Skeleton className="mx-auto h-4 w-4 rounded-full" />
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.id} className={cn(cellBase, c.className)}>
                      {c.skeleton}
                    </td>
                  ))}
                  <td className={cn(cellBase, stickyBody, pinnedRight, "right-0 border-l border-r-0 px-2")}>
                    <Skeleton className="h-8 w-[72px] rounded-[6px]" />
                  </td>
                </tr>
              ))
            : rows.map((r, i) => (
                <tr key={r.id} onClick={() => onOpen(r)} className="settle group cursor-pointer" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <td className={cn(cellBase, stickyBody, "left-0 px-0 text-center")} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onSave(r)} className="p-2" aria-label={r.saved ? "Unsave" : "Save"}>
                      <Star className={cn("h-4 w-4 transition-colors", r.saved ? "fill-vermilion text-vermilion" : "text-faint hover:text-muted")} strokeWidth={1.8} />
                    </button>
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.id} className={cn(cellBase, "group-hover:bg-[#fbf7f1]", c.className)}>
                      {c.cell(r)}
                    </td>
                  ))}
                  <td className={cn(cellBase, stickyBody, pinnedRight, "right-0 border-l border-r-0 px-2")} onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" onClick={() => onEmail(r)}>
                      <Mail className="h-3.5 w-3.5" /> Email
                    </Button>
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
