"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowDownUp, ArrowUp, Check, Mail, Minus, Phone, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Pill, Skeleton } from "@/components/ui/kit";
import { LinkedInMark } from "./brand-icons";
import { formatFunding, type DirectoryRow, type SortDir, type SortKey } from "@/lib/directory";
import { INVESTOR_TYPES, label, ROLES, SECTORS, STAGES } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

// Every cell is one line: nowrap, fixed row height, the table scrolls sideways instead.
const cellBase = "h-12 whitespace-nowrap border-b border-r border-line-2 px-3 align-middle";
const stickyBody = "sticky z-[1] bg-panel group-hover:bg-[#fbf7f1]";
const stickyHead = "sticky z-[2] bg-[#faf6ef]";
// Soft edges on the pinned columns so scrolled content visibly slides underneath.
const pinnedLeft = "shadow-[8px_0_10px_-10px_rgba(57,28,37,0.28)]";
const pinnedRight = "shadow-[-8px_0_10px_-10px_rgba(57,28,37,0.28)]";

function Chips({ items, map, max = 3 }: { items: string[]; map: Record<string, string>; max?: number }) {
  if (!items.length) return <span className="text-[12px] text-faint">Not stated</span>;
  return (
    <div className="flex flex-nowrap items-center gap-1">
      {items.slice(0, max).map((s) => (
        <span key={s} className="rounded-[4px] border border-line-2 bg-panel-2 px-1.5 py-px text-[11.5px] text-muted">
          {label(map, s)}
        </span>
      ))}
      {items.length > max && <span className="text-[11.5px] text-label">+{items.length - max}</span>}
    </div>
  );
}

function FitBar({ score, pick }: { score: number; pick: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-line-3">
        <div className={cn("h-full rounded-full", score >= 60 ? "bg-burgundy" : score >= 40 ? "bg-[#a8968c]" : "bg-[#d5c8ba]")} style={{ width: `${score}%` }} />
      </div>
      <span className="tabular w-6 text-right text-[12.5px] font-medium text-ink">{score}</span>
      {pick && <Sparkles className="h-3.5 w-3.5 text-vermilion" aria-label="Claude pick" />}
    </div>
  );
}

function Status({ r }: { r: DirectoryRow }) {
  if (r.replied) return <Pill tone="green">Replied</Pill>;
  if (r.opened) return <Pill tone="amber">Opened</Pill>;
  if (r.contacted) return <Pill tone="burgundy">Contacted</Pill>;
  if (r.queued) return <Pill>Queued</Pill>;
  return <span className="text-[12px] text-faint">Not contacted</span>;
}

function Reach({ r }: { r: DirectoryRow }) {
  const dot = (on: boolean, icon: ReactNode, title: string) => (
    <span title={title} className={cn("flex h-6 w-6 items-center justify-center rounded-[5px] border", on ? "border-line bg-panel text-ink" : "border-transparent text-faint/60")}>
      {icon}
    </span>
  );
  return (
    <div className="flex items-center gap-1">
      {dot(true, <Mail className="h-3.5 w-3.5" />, r.unlocked ? r.email : "Email on file")}
      {dot(r.has_phone, <Phone className="h-3.5 w-3.5" />, r.has_mobile ? "Mobile number on file" : r.has_direct ? "Direct line on file" : "No phone")}
      {dot(r.has_linkedin, <LinkedInMark className="h-3.5 w-3.5" />, r.has_linkedin ? "LinkedIn on file" : "No LinkedIn")}
    </div>
  );
}

type Column = {
  id: string;
  header: ReactNode;
  sort?: SortKey;
  className?: string;
  headClassName?: string;
  cell: (r: DirectoryRow) => ReactNode;
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
    className: cn(stickyBody, pinnedLeft, "left-[76px] min-w-[220px] max-w-[260px]"),
    headClassName: cn(stickyHead, pinnedLeft, "left-[76px]"),
    cell: (r) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={r.full_name} className="h-6 w-6 shrink-0 text-[10px]" />
        <span className="truncate font-medium text-ink">{r.full_name}</span>
        {r.source === "test" && <Pill>Test</Pill>}
      </div>
    ),
    skeleton: (
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-6 w-6 rounded-[6px]" />
        {bar(104)}
      </div>
    ),
  },
  { id: "title", header: "Title", className: "max-w-[220px] truncate text-muted", cell: (r) => r.title ?? label(ROLES, r.role), skeleton: bar(92) },
  { id: "firm", header: "Firm", sort: "firm", className: "max-w-[220px] truncate text-ink", cell: (r) => r.firm, skeleton: bar(140) },
  { id: "type", header: "Type", className: "text-muted", cell: (r) => label(INVESTOR_TYPES, r.investor_type), skeleton: bar(48) },
  { id: "stages", header: "Stages", cell: (r) => <Chips items={r.stages} map={STAGES} />, skeleton: chipBars(58, 40) },
  { id: "sectors", header: "Sectors", cell: (r) => <Chips items={r.sectors} map={SECTORS} />, skeleton: chipBars(84, 112, 70) },
  { id: "location", header: "Location", sort: "location", className: "max-w-[200px] truncate text-muted", cell: (r) => r.location ?? "Not stated", skeleton: bar(96) },
  {
    id: "size",
    header: "Firm size",
    sort: "size",
    className: "tabular text-muted",
    cell: (r) => (r.firm_employees ? `${r.firm_employees.toLocaleString("en-GB")} people` : "Not stated"),
    skeleton: bar(60),
  },
  {
    id: "funding",
    header: "Firm raised",
    sort: "funding",
    className: "tabular text-muted",
    cell: (r) => formatFunding(r.firm_funding) ?? "Not stated",
    skeleton: bar(52),
  },
  { id: "founded", header: "Founded", sort: "founded", className: "tabular text-muted", cell: (r) => r.firm_founded ?? "Not stated", skeleton: bar(36) },
  { id: "reach", header: "Contact", cell: (r) => <Reach r={r} />, skeleton: chipBars(24, 24, 24) },
  { id: "fit", header: "Fit", sort: "match", cell: (r) => <FitBar score={r.score} pick={r.pick_rank != null} />, skeleton: bar(88) },
  { id: "status", header: "Status", cell: (r) => <Status r={r} />, skeleton: bar(76) },
];

function Box({ state, onClick, label: aria }: { state: "on" | "off" | "some"; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      aria-pressed={state === "on"}
      className={cn(
        "mx-auto flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors",
        state === "off" ? "border-[#d5c8ba] bg-panel hover:border-[#b9a79c]" : "border-burgundy bg-burgundy text-ivory",
      )}
    >
      {state === "on" && <Check className="h-3 w-3" strokeWidth={3} />}
      {state === "some" && <Minus className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

export function InvestorTable({
  rows,
  loading,
  sort,
  dir,
  onSort,
  onOpen,
  onSave,
  onEmail,
  selected,
  onSelect,
  onSelectPage,
}: {
  rows: DirectoryRow[];
  loading: boolean;
  sort: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  onOpen: (r: DirectoryRow) => void;
  onSave: (r: DirectoryRow) => void;
  onEmail: (r: DirectoryRow) => void;
  selected: Map<string, DirectoryRow>;
  onSelect: (r: DirectoryRow) => void;
  onSelectPage: (on: boolean) => void;
}) {
  const onPage = rows.filter((r) => selected.has(r.id)).length;
  const pageState = onPage === 0 ? "off" : onPage === rows.length ? "on" : "some";

  return (
    <div className="quiet-scroll overflow-x-auto">
      <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th className={cn(cellBase, stickyHead, "left-0 h-10 w-10 border-line px-0 text-center")}>
              {!loading && rows.length > 0 && <Box state={pageState} onClick={() => onSelectPage(pageState !== "on")} label="Select this page" />}
            </th>
            <th className={cn(cellBase, stickyHead, "left-10 h-10 w-9 border-line px-0 text-center")}>
              <Star className="mx-auto h-3.5 w-3.5 text-label" />
            </th>
            {COLUMNS.map((c) => (
              <th key={c.id} className={cn(cellBase, "h-10 border-line bg-[#faf6ef] text-left text-[12px] font-medium text-ink", c.headClassName)}>
                {c.sort ? (
                  <button className="inline-flex items-center gap-1 hover:text-vermilion" onClick={() => onSort(c.sort!)}>
                    {c.header}
                    {sort === c.sort ? (
                      dir === "asc" ? (
                        <ArrowUp className="h-3 w-3 text-vermilion" />
                      ) : (
                        <ArrowDown className="h-3 w-3 text-vermilion" />
                      )
                    ) : (
                      <ArrowDownUp className="h-3 w-3 text-faint" />
                    )}
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
          {loading && rows.length === 0
            ? Array.from({ length: 10 }, (_, i) => (
                <tr key={i} className="group">
                  <td className={cn(cellBase, stickyBody, "left-0 px-0")}>
                    <Skeleton className="mx-auto h-4 w-4 rounded-[4px]" />
                  </td>
                  <td className={cn(cellBase, stickyBody, "left-10 px-0")}>
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
            : rows.map((r, i) => {
                const on = selected.has(r.id);
                return (
                  <tr
                    key={r.id}
                    onClick={() => onOpen(r)}
                    className={cn("settle group cursor-pointer transition-opacity", loading && "opacity-60")}
                    style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}
                  >
                    <td className={cn(cellBase, stickyBody, "left-0 px-0 text-center", on && "bg-[#f7f0e6]")} onClick={(e) => e.stopPropagation()}>
                      <Box state={on ? "on" : "off"} onClick={() => onSelect(r)} label={on ? `Deselect ${r.full_name}` : `Select ${r.full_name}`} />
                    </td>
                    <td className={cn(cellBase, stickyBody, "left-10 px-0 text-center", on && "bg-[#f7f0e6]")} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => onSave(r)} className="p-2" aria-label={r.saved ? "Unsave" : "Save"}>
                        <Star className={cn("h-4 w-4 transition-colors", r.saved ? "fill-vermilion text-vermilion" : "text-faint hover:text-muted")} strokeWidth={1.8} />
                      </button>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.id} className={cn(cellBase, "group-hover:bg-[#fbf7f1]", on && "bg-[#f7f0e6]", c.className)}>
                        {c.cell(r)}
                      </td>
                    ))}
                    <td className={cn(cellBase, stickyBody, pinnedRight, "right-0 border-l border-r-0 px-2")} onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" onClick={() => onEmail(r)}>
                        <Mail className="h-3.5 w-3.5" /> Email
                      </Button>
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
