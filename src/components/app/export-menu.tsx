"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Braces, ChevronDown, Download, FileText, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { EXPORT_LIMIT, type DirectoryRow } from "@/lib/directory";
import { downloadInvestors, type ExportFormat } from "@/lib/export";
import { cn } from "@/lib/utils";

const OPTIONS: { format: ExportFormat; label: string; hint: string; icon: typeof Sheet }[] = [
  { format: "csv", label: "CSV", hint: "Excel, Sheets, your CRM", icon: Sheet },
  { format: "md", label: "Markdown", hint: "Notion, docs, a table to paste", icon: FileText },
  { format: "json", label: "JSON", hint: "Scripts and integrations", icon: Braces },
];

/**
 * Exports either every investor matching the current filters (fetched in pages, up to EXPORT_LIMIT)
 * or just the selected ones, in the order shown.
 */
export function ExportMenu({
  total,
  selected,
  fetchMatching,
}: {
  total: number | null;
  selected: DirectoryRow[];
  fetchMatching: (onProgress: (done: number, of: number) => void) => Promise<DirectoryRow[]>;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"matching" | "selected">("matching");
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const matching = Math.min(total ?? 0, EXPORT_LIMIT);

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

  const effectiveScope = selected.length ? scope : "matching";

  async function run(format: ExportFormat) {
    setOpen(false);
    try {
      if (effectiveScope === "selected") return downloadInvestors(selected, format);
      setProgress({ done: 0, of: matching });
      const rows = await fetchMatching((done, of) => setProgress({ done, of }));
      downloadInvestors(rows, format);
      if ((total ?? 0) > EXPORT_LIMIT) {
        toast({ title: `Exported the first ${EXPORT_LIMIT.toLocaleString("en-GB")}`, body: "Narrow the filters to export the rest." });
      }
    } catch (err) {
      toast({ title: "Export failed", body: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setProgress(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <Button size="sm" disabled={!total || progress != null} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Download className="h-3.5 w-3.5" />
        {progress ? `Exporting ${progress.done.toLocaleString("en-GB")} of ${progress.of.toLocaleString("en-GB")}` : "Export"}
        <ChevronDown className="h-3.5 w-3.5 text-label" />
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 z-40 w-[270px] rounded-[8px] border border-line bg-panel p-1 shadow-[0_18px_40px_-20px_rgba(57,28,37,0.35)]"
          >
            {selected.length > 0 ? (
              <div className="m-1 mb-1.5 grid grid-cols-2 gap-1 rounded-[6px] bg-panel-2 p-0.5 text-[12.5px]">
                {(["matching", "selected"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className={cn("rounded-[5px] px-2 py-1", effectiveScope === s ? "bg-panel text-ink shadow-[0_1px_2px_rgba(57,28,37,0.08)]" : "text-label hover:text-ink")}
                  >
                    {s === "matching" ? `All ${matching.toLocaleString("en-GB")}` : `Selected ${selected.length}`}
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-2.5 pb-1.5 pt-2 text-[12px] text-label">
                Exports all {matching.toLocaleString("en-GB")} investors matching your filters
                {(total ?? 0) > EXPORT_LIMIT ? `, the first ${EXPORT_LIMIT.toLocaleString("en-GB")} in this order` : ""}
              </p>
            )}
            {OPTIONS.map(({ format, label, hint, icon: Icon }) => (
              <button
                key={format}
                onClick={() => void run(format)}
                className="flex w-full items-center gap-3 rounded-[6px] px-2.5 py-2 text-left hover:bg-black/[0.035]"
              >
                <Icon className="h-4 w-4 shrink-0 text-vermilion" strokeWidth={1.8} />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-ink">{label}</span>
                  <span className="block truncate text-[12px] text-label">{hint}</span>
                </span>
                <span className="ml-auto text-[11.5px] text-faint">.{format}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
