"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** A bordered filter button that opens a checklist popover. */
export function FilterMenu({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; count?: number }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);

  const active = selected.length > 0;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-[6px] border px-2.5 text-[13px] shadow-[0_1px_0_rgba(57,28,37,0.03)] transition-colors",
          active ? "border-[#b9a79c] bg-[#f4ede3] text-ink" : "border-line bg-panel text-muted hover:border-[#d5c8ba] hover:text-ink",
        )}
      >
        {label}
        {active && <span className="rounded-[4px] bg-burgundy px-1 text-[11px] font-semibold leading-4 text-ivory">{selected.length}</span>}
        <ChevronDown className="h-3.5 w-3.5 text-label" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="quiet-scroll absolute left-0 top-9 z-30 max-h-[320px] min-w-[220px] overflow-y-auto rounded-[8px] border border-line bg-panel p-1 shadow-[0_18px_40px_-20px_rgba(57,28,37,0.35)]"
          >
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  onClick={() => onChange(on ? selected.filter((x) => x !== o.value) : [...selected, o.value])}
                  className="flex w-full items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-left text-[13px] text-ink hover:bg-black/[0.035]"
                >
                  <span className={cn("flex h-4 w-4 items-center justify-center rounded-[4px] border", on ? "border-burgundy bg-burgundy text-ivory" : "border-[#d5c8ba] bg-panel")}>
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="flex-1">{o.label}</span>
                  {o.count != null && <span className="tabular text-[11.5px] text-label">{o.count}</span>}
                </button>
              );
            })}
            {active && (
              <button onClick={() => onChange([])} className="mt-1 w-full rounded-[5px] border-t border-line-2 px-2 py-1.5 text-left text-[12.5px] text-label hover:text-ink">
                Clear
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-[6px] border px-2.5 text-[13px] shadow-[0_1px_0_rgba(57,28,37,0.03)] transition-colors",
        on ? "border-[#b9a79c] bg-[#f4ede3] text-ink" : "border-line bg-panel text-muted hover:border-[#d5c8ba] hover:text-ink",
      )}
    >
      <span className={cn("h-3 w-5 rounded-full p-[2px] transition-colors", on ? "bg-burgundy" : "bg-[#e2d7c9]")}>
        <span className={cn("block h-2 w-2 rounded-full bg-ivory transition-transform", on && "translate-x-2")} />
      </span>
      {children}
    </button>
  );
}
