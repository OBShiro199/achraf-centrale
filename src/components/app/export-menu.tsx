"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Braces, ChevronDown, Download, FileText, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InvestorRow } from "@/lib/data";
import { downloadInvestors, type ExportFormat } from "@/lib/export";

const OPTIONS: { format: ExportFormat; label: string; hint: string; icon: typeof Sheet }[] = [
  { format: "csv", label: "CSV", hint: "Excel, Sheets, your CRM", icon: Sheet },
  { format: "md", label: "Markdown", hint: "Notion, docs, a table to paste", icon: FileText },
  { format: "json", label: "JSON", hint: "Scripts and integrations", icon: Braces },
];

export function ExportMenu({ rows }: { rows: InvestorRow[] | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = rows?.length ?? 0;

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

  return (
    <div ref={ref} className="relative">
      <Button size="sm" disabled={!rows || count === 0} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Download className="h-3.5 w-3.5" />
        Export {rows ? `${count} investor${count === 1 ? "" : "s"}` : ""}
        <ChevronDown className="h-3.5 w-3.5 text-label" />
      </Button>
      <AnimatePresence>
        {open && rows && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 z-40 w-[250px] rounded-[8px] border border-line bg-panel p-1 shadow-[0_18px_40px_-20px_rgba(57,28,37,0.35)]"
          >
            <p className="px-2.5 pb-1.5 pt-2 text-[12px] text-label">Exports the {count} investors currently shown</p>
            {OPTIONS.map(({ format, label, hint, icon: Icon }) => (
              <button
                key={format}
                onClick={() => {
                  downloadInvestors(rows, format);
                  setOpen(false);
                }}
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
