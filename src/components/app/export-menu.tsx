"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Braces, ChevronDown, Download, FileText, Lock, Sheet } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { exportMatching, type DirectoryFilters, type DirectoryRow, type Entitlements, type SortDir, type SortKey } from "@/lib/directory";
import { downloadInvestors, type ExportFormat } from "@/lib/export";
import { cn } from "@/lib/utils";

const OPTIONS: { format: ExportFormat; label: string; hint: string; icon: typeof Sheet }[] = [
  { format: "csv", label: "CSV", hint: "Excel, Sheets, your CRM", icon: Sheet },
  { format: "md", label: "Markdown", hint: "Notion, docs, a table to paste", icon: FileText },
  { format: "json", label: "JSON", hint: "Scripts and integrations", icon: Braces },
];

const n = (x: number) => x.toLocaleString("en-GB");

/**
 * Exports run on the server: each investor not already revealed or exported costs one export credit,
 * and the file stops where the credits run out. The free trial has no exports.
 */
export function ExportMenu({
  total,
  selected,
  filters,
  sort,
  dir,
  ent,
  onDone,
}: {
  total: number | null;
  selected: DirectoryRow[];
  filters: DirectoryFilters;
  sort: SortKey;
  dir: SortDir;
  ent: Entitlements | null;
  onDone: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"matching" | "selected">("matching");
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const locked = ent != null && ent.exports_total === 0;
  const left = ent?.exports_left ?? 0;
  const effectiveScope = selected.length ? scope : "matching";
  const want = effectiveScope === "selected" ? selected.length : total ?? 0;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function run(format: ExportFormat) {
    setOpen(false);
    try {
      const scoped = effectiveScope === "selected" ? { ...filters, ids: selected.map((r) => r.id) } : filters;
      setProgress({ done: 0, of: Math.min(want, left) });
      const res = await exportMatching(scoped, sort, dir, want, (done, of) => setProgress({ done, of }));
      if (!res.rows.length) return toast({ title: "Nothing to export", body: "No investors matched, or no credits were left.", tone: "error" });
      downloadInvestors(res.rows, format);
      toast({
        title: `Exported ${n(res.rows.length)} investor${res.rows.length === 1 ? "" : "s"}`,
        body: `${n(res.charged)} credit${res.charged === 1 ? "" : "s"} used, ${n(res.exports_left)} left this period.${
          res.rows.length < want ? " The file stopped where your credits ran out." : ""
        }`,
      });
      onDone();
    } catch (err) {
      toast({ title: "Export failed", body: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setProgress(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <Button size="sm" disabled={!total || progress != null} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {locked ? <Lock className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
        {progress ? `Exporting ${n(progress.done)} of ${n(progress.of)}` : "Export"}
        <ChevronDown className="h-3.5 w-3.5 text-label" />
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 z-40 w-[280px] rounded-[8px] border border-line bg-panel p-1 shadow-[0_18px_40px_-20px_rgba(57,28,37,0.35)]"
          >
            {locked ? (
              <div className="p-3">
                <p className="text-[13.5px] font-medium text-ink">Exports come with a paid plan</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-label">
                  The free trial lets you search, reveal {ent?.reveals_total ?? 25} contacts and email investors from Centrale. Starter includes 500
                  export credits a month.
                </p>
                <ButtonLink href="/dashboard/billing" size="sm" variant="primary" className="mt-3 w-full">
                  See plans
                </ButtonLink>
              </div>
            ) : (
              <>
                {selected.length > 0 && (
                  <div className="m-1 mb-1.5 grid grid-cols-2 gap-1 rounded-[6px] bg-panel-2 p-0.5 text-[12.5px]">
                    {(["matching", "selected"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setScope(s)}
                        className={cn(
                          "rounded-[5px] px-2 py-1",
                          effectiveScope === s ? "bg-panel text-ink shadow-[0_1px_2px_rgba(57,28,37,0.08)]" : "text-label hover:text-ink",
                        )}
                      >
                        {s === "matching" ? `All ${n(total ?? 0)}` : `Selected ${selected.length}`}
                      </button>
                    ))}
                  </div>
                )}
                <p className="px-2.5 pb-1.5 pt-2 text-[12px] leading-relaxed text-label">
                  {n(left)} export credit{left === 1 ? "" : "s"} left. Each investor you have not revealed or exported before uses one.
                  {want > left ? ` This file will stop at ${n(left)} new investors.` : ""}
                </p>
                {OPTIONS.map(({ format, label, hint, icon: Icon }) => (
                  <button
                    key={format}
                    disabled={left <= 0}
                    onClick={() => void run(format)}
                    className="flex w-full items-center gap-3 rounded-[6px] px-2.5 py-2 text-left hover:bg-black/[0.035] disabled:opacity-45"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-vermilion" strokeWidth={1.8} />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-ink">{label}</span>
                      <span className="block truncate text-[12px] text-label">{hint}</span>
                    </span>
                    <span className="ml-auto text-[11.5px] text-faint">.{format}</span>
                  </button>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
