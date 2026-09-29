"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
  count?: number;
}

/** Closes on outside click and Escape. */
function usePopover() {
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
  return { open, setOpen, ref };
}

function Trigger({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[6px] border px-2.5 text-[13px] shadow-[0_1px_0_rgba(57,28,37,0.03)] transition-colors",
        active ? "border-[#b9a79c] bg-[#f4ede3] text-ink" : "border-line bg-panel text-muted hover:border-[#d5c8ba] hover:text-ink",
      )}
    >
      {label}
      {active && count != null && <span className="rounded-[4px] bg-burgundy px-1 text-[11px] font-semibold leading-4 text-ivory">{count}</span>}
      <ChevronDown className="h-3.5 w-3.5 text-label" />
    </button>
  );
}

function Panel({ children, className, align = "left" }: { children: ReactNode; className?: string; align?: "left" | "right" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "absolute top-9 z-30 rounded-[8px] border border-line bg-panel p-1 shadow-[0_18px_40px_-20px_rgba(57,28,37,0.35)]",
        align === "right" ? "right-0" : "left-0",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

function CheckRow({ on, label, count, onClick }: { on: boolean; label: ReactNode; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-left text-[13px] text-ink hover:bg-black/[0.035]">
      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border", on ? "border-burgundy bg-burgundy text-ivory" : "border-[#d5c8ba] bg-panel")}>
        {on && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && <span className={cn("tabular text-[11.5px]", count ? "text-label" : "text-faint")}>{count.toLocaleString("en-GB")}</span>}
    </button>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative m-1 mb-1.5">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-label" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-[5px] border border-line bg-panel-2 pl-7 pr-2 text-[13px] text-ink placeholder:text-faint focus:border-[#ae9d92] focus:outline-none"
      />
    </div>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/**
 * A checklist filter. Options within one menu are OR: an investor matches if any ticked option applies.
 * Long lists get a search box. Zero-count options stay visible but sink below the rest.
 */
export function FilterMenu({
  label,
  options,
  selected,
  onChange,
  searchable,
  hint,
  align,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
  hint?: string;
  align?: "left" | "right";
}) {
  const { open, setOpen, ref } = usePopover();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return options
      .filter((o) => !needle || o.label.toLowerCase().includes(needle))
      .sort((a, b) => Number(selected.includes(b.value)) - Number(selected.includes(a.value)) || Number((b.count ?? 1) > 0) - Number((a.count ?? 1) > 0));
  }, [options, q, selected]);

  return (
    <div ref={ref} className="relative">
      <Trigger label={label} count={selected.length} active={selected.length > 0} onClick={() => setOpen((o) => !o)} />
      <AnimatePresence>
        {open && (
          <Panel align={align} className="w-[260px]">
            {searchable && <SearchBox value={q} onChange={setQ} placeholder={`Search ${label.toLowerCase()}`} />}
            {hint && <p className="px-2 pb-1 pt-1.5 text-[11.5px] text-label">{hint}</p>}
            <div className="quiet-scroll max-h-[300px] overflow-y-auto">
              {shown.map((o) => (
                <CheckRow key={o.value} on={selected.includes(o.value)} label={o.label} count={o.count} onClick={() => onChange(toggle(selected, o.value))} />
              ))}
              {!shown.length && <p className="px-2 py-3 text-[12.5px] text-label">Nothing matches</p>}
            </div>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="mt-1 w-full rounded-[5px] border-t border-line-2 px-2 py-1.5 text-left text-[12.5px] text-label hover:text-ink">
                Clear {label.toLowerCase()}
              </button>
            )}
          </Panel>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Several checklists in one menu that act as a single OR group, such as region, country and city. */
export function GroupedMenu({
  label,
  sections,
  hint,
}: {
  label: string;
  sections: { title: string; options: Option[]; selected: string[]; onChange: (v: string[]) => void }[];
  hint?: string;
}) {
  const { open, setOpen, ref } = usePopover();
  const [q, setQ] = useState("");
  const count = sections.reduce((n, s) => n + s.selected.length, 0);
  const needle = q.trim().toLowerCase();

  return (
    <div ref={ref} className="relative">
      <Trigger label={label} count={count} active={count > 0} onClick={() => setOpen((o) => !o)} />
      <AnimatePresence>
        {open && (
          <Panel className="w-[280px]">
            <SearchBox value={q} onChange={setQ} placeholder={`Search ${label.toLowerCase()}`} />
            {hint && <p className="px-2 pb-1 text-[11.5px] text-label">{hint}</p>}
            <div className="quiet-scroll max-h-[340px] overflow-y-auto">
              {sections.map((s) => {
                const shown = s.options.filter((o) => !needle || o.label.toLowerCase().includes(needle));
                if (!shown.length) return null;
                return (
                  <div key={s.title} className="pb-1">
                    <p className="px-2 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-faint">{s.title}</p>
                    {shown.map((o) => (
                      <CheckRow key={o.value} on={s.selected.includes(o.value)} label={o.label} count={o.count} onClick={() => s.onChange(toggle(s.selected, o.value))} />
                    ))}
                  </div>
                );
              })}
            </div>
            {count > 0 && (
              <button
                onClick={() => sections.forEach((s) => s.onChange([]))}
                className="mt-1 w-full rounded-[5px] border-t border-line-2 px-2 py-1.5 text-left text-[12.5px] text-label hover:text-ink"
              >
                Clear {label.toLowerCase()}
              </button>
            )}
          </Panel>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A single-choice menu, for settings like status or minimum fit. */
export function ChoiceMenu<T extends string | number>({
  label,
  options,
  value,
  onChange,
  isDefault,
}: {
  label: string;
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  isDefault: boolean;
}) {
  const { open, setOpen, ref } = usePopover();
  const current = options.find((o) => o.value === value);
  return (
    <div ref={ref} className="relative">
      <Trigger label={isDefault ? label : `${label}: ${current?.label ?? value}`} active={!isDefault} onClick={() => setOpen((o) => !o)} />
      <AnimatePresence>
        {open && (
          <Panel className="w-[240px]">
            {options.map((o) => (
              <button
                key={String(o.value)}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-left text-[13px] text-ink hover:bg-black/[0.035]"
              >
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", o.value === value ? "border-burgundy" : "border-[#d5c8ba]")}>
                  {o.value === value && <span className="h-2 w-2 rounded-full bg-burgundy" />}
                </span>
                <span className="flex-1">{o.label}</span>
                {o.count != null && <span className="tabular text-[11.5px] text-label">{o.count.toLocaleString("en-GB")}</span>}
              </button>
            ))}
          </Panel>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Free-form content in the same popover, for keywords and year ranges. */
export function PanelMenu({ label, count, children, width = 320 }: { label: string; count: number; children: ReactNode; width?: number }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <Trigger label={label} count={count} active={count > 0} onClick={() => setOpen((o) => !o)} />
      <AnimatePresence>
        {open && (
          <Panel className="p-3" align="left">
            <div style={{ width }}>{children}</div>
          </Panel>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[6px] border px-2.5 text-[13px] shadow-[0_1px_0_rgba(57,28,37,0.03)] transition-colors",
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

/** A removable chip describing one applied filter. */
export function FilterChip({ children, onRemove, tone = "include" }: { children: ReactNode; onRemove: () => void; tone?: "include" | "exclude" }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-[5px] border pl-2 pr-1 text-[12.5px]",
        tone === "exclude" ? "border-[#f0cfc6] bg-pencil-soft text-pencil" : "border-line bg-panel text-ink",
      )}
    >
      {children}
      <button onClick={onRemove} className="rounded-[4px] p-0.5 text-label hover:bg-black/[0.05] hover:text-ink" aria-label="Remove filter">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
