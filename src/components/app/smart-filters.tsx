"use client";

import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, Check, Plus, Search, X } from "lucide-react";
import type { FacetValues, LeadFacets } from "@/lib/directory";
import { displayValue, FILTERS, GROUPS, isSet, keysOf, summary, type FilterDef, type Filters } from "@/lib/lead-filters";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("en-GB");
const ADD = "__add";
/** Most options a list editor renders at once; searching reaches the rest. */
const MAX_OPTIONS = 250;

const shadow = "shadow-[0_18px_40px_-20px_rgba(57,28,37,0.35)]";
const smallInput =
  "h-8 w-full rounded-[5px] border border-line bg-panel-2 px-2 text-[13px] text-ink placeholder:text-faint focus:border-label focus:outline-none";

/** Moves focus through `[data-nav]` items with the arrow keys; ArrowUp from the first item returns to the panel's input. */
function arrowNav(e: ReactKeyboardEvent<HTMLElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const target = e.target as HTMLElement;
  if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type === "number")) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-nav]")];
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i === 0 && e.key === "ArrowUp") {
    e.currentTarget.querySelector<HTMLElement>("[data-nav-input]")?.focus();
    return;
  }
  const next = i === -1 ? (e.key === "ArrowDown" ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
  items[next].focus();
}

/**
 * A popover anchored under its trigger. Closes on outside click and Escape (which returns focus to the
 * trigger, marked `data-trigger`), flips to the right edge when it would overflow, and becomes a bottom
 * sheet under 640px. `focusKey` refocuses the first input or item when the content swaps.
 */
export function Popover({
  open,
  onClose,
  trigger,
  children,
  label,
  width = 320,
  focusKey,
}: {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  label: string;
  width?: number;
  focusKey?: string | number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setAlignRight(r.left + width + 16 > window.innerWidth && r.right - width > 0);
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      ref.current?.querySelector<HTMLElement>("[data-trigger]")?.focus();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const p = panel.current;
      if (!p || p.contains(document.activeElement)) return;
      (p.querySelector<HTMLElement>("[data-nav-input]") ?? p.querySelector<HTMLElement>("[data-nav]") ?? p.querySelector<HTMLElement>("input, button"))?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, focusKey]);

  return (
    <div ref={ref} className="relative">
      {trigger}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-display/20 sm:hidden" onClick={onClose} aria-hidden />
          <motion.div
            ref={panel}
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14 }}
            onKeyDown={arrowNav}
            style={{ "--w": `${width}px` } as CSSProperties}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex max-h-[82vh] flex-col overflow-hidden rounded-t-[12px] border border-line bg-panel pb-[env(safe-area-inset-bottom)]",
              "sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:z-40 sm:mt-1.5 sm:max-h-[min(70vh,480px)] sm:w-[var(--w)] sm:rounded-[8px] sm:pb-0",
              alignRight ? "sm:right-0" : "sm:left-0",
              shadow,
            )}
          >
            {children}
          </motion.div>
        </>
      )}
    </div>
  );
}

function PanelHeader({ title, onBack, hint }: { title: string; onBack?: () => void; hint?: string }) {
  return (
    <div className="border-b border-line-2 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        {onBack && (
          <button onClick={onBack} className="-ml-1 rounded-[5px] p-1 text-label hover:bg-black/[0.04] hover:text-ink" aria-label="Back to all filters">
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="text-[13px] font-semibold text-ink">{title}</span>
      </div>
      {hint && <p className="mt-0.5 text-[12px] leading-snug text-label">{hint}</p>}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-label" />
      <input data-nav-input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={cn(smallInput, "pl-7")} />
    </div>
  );
}

function CheckBox({ on }: { on: boolean }) {
  return (
    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border", on ? "border-burgundy bg-burgundy text-ivory" : "border-faint bg-panel")}>
      {on && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

// ------------------------------------------------------------------------------------------
// Editors, one per filter kind

type Opt = { value: string; n?: number };

function MultiEditor({ def, values, onChange, facets }: { def: FilterDef; values: string[]; onChange: (v: string[]) => void; facets: LeadFacets | null }) {
  const [q, setQ] = useState("");
  // Selected values float to the top when the list opens or the search changes, not on every tick, so rows never jump under the pointer.
  const [pinned, setPinned] = useState<string[]>(values);
  const source: FacetValues | null = def.facet ? (facets?.[def.facet] ?? null) : null;
  const waiting = !!def.facet && !facets && !def.order;

  const all = useMemo<Opt[]>(() => {
    let list: Opt[] = def.options ? def.options.map((o) => ({ value: o.value })) : (source ?? []).map((x) => ({ value: x.value, n: x.n }));
    if (def.order) {
      const idx = new Map(def.order.map((v, i) => [v, i]));
      const have = new Set(list.map((x) => x.value));
      for (const v of def.order) if (!have.has(v)) list.push({ value: v, n: source ? 0 : undefined });
      list = [...list].sort((a, b) => (idx.get(a.value) ?? 1e6) - (idx.get(b.value) ?? 1e6) || (b.n ?? 0) - (a.n ?? 0));
    } else if (source) {
      list = [...list].sort((a, b) => (b.n ?? 0) - (a.n ?? 0));
    }
    return list;
  }, [def, source]);

  const byValue = useMemo(() => new Map(all.map((o) => [o.value, o])), [all]);
  const needle = q.trim().toLowerCase();
  const pinning = needle !== "" || !def.order;

  const shown = useMemo<Opt[]>(() => {
    const matches = (o: Opt) => !needle || displayValue(def, o.value).toLowerCase().includes(needle);
    if (!pinning) {
      // Ordered lists keep their order; a selected value the list does not know still shows at the end.
      const missing: Opt[] = values.filter((v) => !byValue.has(v)).map((v) => ({ value: v }));
      return [...all.slice(0, MAX_OPTIONS), ...missing];
    }
    const pins = new Set([...pinned, ...values.filter((v) => !byValue.has(v))]);
    const head = [...pins].map((v) => byValue.get(v) ?? { value: v });
    const rest = all.filter((o) => !pins.has(o.value) && matches(o)).slice(0, MAX_OPTIONS);
    return [...head, ...rest];
  }, [all, byValue, def, needle, pinned, pinning, values]);

  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const searchable = all.length > 8;

  return (
    <>
      {searchable && (
        <div className="border-b border-line-2 p-2">
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              setPinned(values);
            }}
            placeholder={`Search ${def.label.toLowerCase()}`}
          />
        </div>
      )}
      <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto p-1">
        {waiting && <p className="px-2 py-3 text-[12.5px] text-label">Loading values</p>}
        {!waiting &&
          shown.map((o) => {
            const on = values.includes(o.value);
            return (
              <button
                key={o.value}
                data-nav
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-left text-[13px] text-ink hover:bg-black/[0.035] focus-visible:bg-black/[0.05] focus-visible:outline-none"
              >
                <CheckBox on={on} />
                <span className="min-w-0 flex-1 truncate">{displayValue(def, o.value)}</span>
                {o.n != null && <span className={cn("tabular text-[11.5px]", o.n ? "text-label" : "text-faint")}>{fmt(o.n)}</span>}
              </button>
            );
          })}
        {!waiting && !shown.length && <p className="px-2 py-3 text-[12.5px] text-label">Nothing matches</p>}
        {!waiting && needle === "" && all.length > MAX_OPTIONS && (
          <p className="px-2 pb-1.5 pt-1 text-[11.5px] text-label">Showing the top {MAX_OPTIONS}. Search to find the rest.</p>
        )}
      </div>
      {values.length > 0 && (
        <div className="flex items-center justify-between border-t border-line-2 px-3 py-2 text-[12.5px]">
          <span className="tabular text-label">{fmt(values.length)} selected</span>
          <button onClick={() => onChange([])} className="text-label hover:text-ink">
            Clear
          </button>
        </div>
      )}
    </>
  );
}

function PillsEditor({ def, values, onChange, facets }: { def: FilterDef; values: string[]; onChange: (v: string[]) => void; facets: LeadFacets | null }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const source = def.facet ? (facets?.[def.facet] ?? null) : null;

  const add = (raw: string[]) => {
    const next = [...values];
    for (const part of raw.map((s) => s.trim()).filter(Boolean)) {
      if (!next.some((v) => v.toLowerCase() === part.toLowerCase())) next.push(part.slice(0, 80));
    }
    if (next.length !== values.length) onChange(next.slice(0, 50));
  };

  const suggestions = useMemo(() => {
    if (!source) return [];
    const needle = text.trim().toLowerCase();
    const chosen = new Set(values.map((v) => v.toLowerCase()));
    const out: FacetValues = [];
    for (const s of source) {
      if (out.length >= 8) break;
      const l = s.value.toLowerCase();
      if (!chosen.has(l) && (!needle || l.includes(needle))) out.push(s);
    }
    return out;
  }, [source, text, values]);

  return (
    <>
      <div className="p-2">
        <div
          className="flex min-h-9 flex-wrap items-center gap-1 rounded-[6px] border border-line bg-panel-2 px-1.5 py-1 focus-within:border-label"
          onClick={() => input.current?.focus()}
        >
          {values.map((v) => (
            <span key={v} className="inline-flex h-6 items-center gap-0.5 rounded-[4px] border border-line bg-panel pl-1.5 text-[12.5px] text-ink">
              {v}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(values.filter((x) => x !== v));
                }}
                className="rounded-[3px] p-0.5 text-label hover:text-ink"
                aria-label={`Remove ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={input}
            data-nav-input
            value={text}
            aria-label={def.label}
            placeholder={values.length ? "Add another" : def.placeholder}
            onChange={(e) => {
              const v = e.target.value;
              if (v.includes(",")) {
                const parts = v.split(",");
                setText(parts.pop() ?? "");
                add(parts);
              } else setText(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                if (text.trim()) {
                  add([text]);
                  setText("");
                }
              } else if (e.key === "Backspace" && !text && values.length) {
                onChange(values.slice(0, -1));
              }
            }}
            className="h-6 min-w-[120px] flex-1 bg-transparent px-1 text-[13px] text-ink placeholder:text-faint focus:outline-none"
          />
        </div>
        <p className="mt-1.5 text-[11.5px] text-label">{def.hint ?? "Press Enter or a comma to add. Any word matches."}</p>
      </div>
      {suggestions.length > 0 && (
        <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto border-t border-line-2 p-1">
          <p className="px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-faint">Suggestions</p>
          {suggestions.map((s) => (
            <button
              key={s.value}
              data-nav
              onClick={() => {
                add([s.value]);
                setText("");
                input.current?.focus();
              }}
              className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[13px] text-ink hover:bg-black/[0.035] focus-visible:bg-black/[0.05] focus-visible:outline-none"
            >
              <Plus className="h-3.5 w-3.5 text-label" />
              <span className="min-w-0 flex-1 truncate">{s.value}</span>
              <span className="tabular text-[11.5px] text-label">{fmt(s.n)}</span>
            </button>
          ))}
        </div>
      )}
      {values.length > 0 && (
        <div className="flex items-center justify-between border-t border-line-2 px-3 py-2 text-[12.5px]">
          <span className="tabular text-label">{fmt(values.length)} added</span>
          <button onClick={() => onChange([])} className="text-label hover:text-ink">
            Clear
          </button>
        </div>
      )}
    </>
  );
}

function BoolEditor({ def, value, onPick }: { def: FilterDef; value: boolean | undefined; onPick: (v: boolean) => void }) {
  return (
    <div role="radiogroup" aria-label={def.label} className="p-1">
      {[true, false].map((v) => {
        const on = value === v;
        return (
          <button
            key={String(v)}
            data-nav
            role="radio"
            aria-checked={on}
            onClick={() => onPick(v)}
            className="flex w-full items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-left text-[13px] text-ink hover:bg-black/[0.035] focus-visible:bg-black/[0.05] focus-visible:outline-none"
          >
            <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", on ? "border-burgundy" : "border-faint")}>
              {on && <span className="h-2 w-2 rounded-full bg-burgundy" />}
            </span>
            {v ? (def.yes ?? def.label) : (def.no ?? `Not ${def.label.toLowerCase()}`)}
          </button>
        );
      })}
    </div>
  );
}

function RangeEditor({ def, filters, set }: { def: FilterDef; filters: Filters; set: (patch: Filters) => void }) {
  const r = def.range!;
  const lo = filters[r.min] as number | undefined;
  const hi = r.max ? (filters[r.max] as number | undefined) : undefined;
  const [from, setFrom] = useState(lo != null ? String(lo) : "");
  const [to, setTo] = useState(hi != null ? String(hi) : "");

  const apply = (a: number | undefined, b: number | undefined) => {
    if (a != null && b != null && a > b) [a, b] = [b, a];
    const patch: Filters = { [r.min]: a };
    if (r.max) patch[r.max] = b;
    set(patch);
    setFrom(a != null ? String(a) : "");
    setTo(b != null ? String(b) : "");
  };
  const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));

  return (
    <div className="space-y-3 p-3">
      {!!r.presets?.length && (
        <div className="flex flex-wrap gap-1.5">
          {r.presets.map((p) => {
            const on = (p.min ?? undefined) === lo && (p.max ?? undefined) === hi;
            return (
              <button
                key={p.label}
                data-nav
                aria-pressed={on}
                onClick={() => apply(p.min, p.max)}
                className={cn(
                  "rounded-[5px] border px-2 py-1 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/15",
                  on ? "border-burgundy bg-burgundy text-ivory" : "border-line text-muted hover:border-faint hover:text-ink",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply(num(from), r.max ? num(to) : undefined);
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[11.5px] text-label">{r.max ? "From" : "At least"}</span>
          <input type="number" inputMode="numeric" step={r.step} value={from} onChange={(e) => setFrom(e.target.value)} className={cn(smallInput, "tabular")} />
        </label>
        {r.max && (
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11.5px] text-label">To</span>
            <input type="number" inputMode="numeric" step={r.step} value={to} onChange={(e) => setTo(e.target.value)} className={cn(smallInput, "tabular")} />
          </label>
        )}
        <button type="submit" className="h-8 shrink-0 rounded-[5px] bg-night px-3 text-[12.5px] font-medium text-ivory hover:brightness-110">
          Apply
        </button>
      </form>
      {r.unit && <p className="text-[11.5px] text-label">In {r.unit}.</p>}
    </div>
  );
}

function Editor({
  def,
  filters,
  set,
  facets,
  onDone,
}: {
  def: FilterDef;
  filters: Filters;
  set: (patch: Filters) => void;
  facets: LeadFacets | null;
  onDone: () => void;
}) {
  const list = (filters[def.key] as string[] | undefined) ?? [];
  switch (def.kind) {
    case "multi":
      return <MultiEditor def={def} values={list} onChange={(v) => set({ [def.key]: v })} facets={facets} />;
    case "pills":
      return <PillsEditor def={def} values={list} onChange={(v) => set({ [def.key]: v })} facets={facets} />;
    case "bool":
      return (
        <BoolEditor
          def={def}
          value={filters[def.key] as boolean | undefined}
          onPick={(v) => {
            set({ [def.key]: v });
            onDone();
          }}
        />
      );
    case "range":
      return <RangeEditor def={def} filters={filters} set={set} />;
  }
}

// ------------------------------------------------------------------------------------------
// The bar

const isExclude = (d: FilterDef) => d.key.endsWith("Not");

/**
 * Every applied filter as a chip in a wrapping row. Clicking a chip edits it, its x removes it, and the
 * dashed Add filter chip lists the filters not yet in use. Filters stack with AND.
 */
export function SmartFilterBar({
  defs = FILTERS,
  filters,
  onChange,
  facets,
}: {
  defs?: FilterDef[];
  filters: Filters;
  onChange: (next: Filters) => void;
  facets: LeadFacets | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [find, setFind] = useState("");

  const close = () => {
    setOpen(null);
    setAdding(null);
    setFind("");
  };
  const toggleOpen = (key: string) => {
    const was = open === key;
    close();
    if (!was) setOpen(key);
  };
  const set = (patch: Filters) => onChange({ ...filters, ...patch });
  const remove = (d: FilterDef) => {
    const next = { ...filters };
    for (const k of keysOf(d)) delete next[k];
    onChange(next);
    if (open === d.key) close();
  };

  // Chips keep the order filters were added in; a chip being edited stays put even when emptied.
  const order = Object.keys(filters);
  const pos = (d: FilterDef) => Math.min(...keysOf(d).map((k) => (order.includes(k) ? order.indexOf(k) : 1e6)));
  const visible = defs.filter((d) => isSet(d, filters) || open === d.key).sort((a, b) => pos(a) - pos(b));
  const anySet = defs.some((d) => isSet(d, filters));

  const needle = find.trim().toLowerCase();
  const available = defs.filter((d) => !isSet(d, filters) && (!needle || d.label.toLowerCase().includes(needle) || d.group.toLowerCase().includes(needle)));
  const addingDef = adding ? defs.find((d) => d.key === adding) : undefined;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((d) => {
        const on = isSet(d, filters);
        const exclude = isExclude(d);
        return (
          <Popover
            key={d.key}
            open={open === d.key}
            onClose={close}
            label={`${d.label} filter`}
            width={d.kind === "range" ? 300 : 320}
            trigger={
              <span
                className={cn(
                  "inline-flex h-8 max-w-[calc(100vw-32px)] items-stretch overflow-hidden rounded-[6px] border text-[13px] shadow-[0_1px_0_rgba(57,28,37,0.03)]",
                  exclude ? "border-pencil-soft bg-pencil-soft/70 text-pencil" : on ? "border-faint bg-panel text-ink" : "border-line bg-panel-2 text-label",
                  open === d.key && "ring-2 ring-ink/10",
                )}
              >
                <button
                  data-trigger
                  aria-haspopup="dialog"
                  aria-expanded={open === d.key}
                  onClick={() => toggleOpen(d.key)}
                  className="min-w-0 truncate px-2.5 text-left hover:bg-black/[0.03] focus-visible:bg-black/[0.04] focus-visible:outline-none sm:max-w-[300px]"
                >
                  {on ? summary(d, filters) : d.label}
                </button>
                {on && (
                  <button
                    onClick={() => remove(d)}
                    className="flex items-center border-l border-current/10 px-1.5 opacity-70 hover:bg-black/[0.04] hover:opacity-100 focus-visible:bg-black/[0.05] focus-visible:outline-none"
                    aria-label={`Remove ${d.label} filter`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            }
          >
            <PanelHeader title={d.label} hint={d.kind === "pills" ? undefined : d.hint} />
            <Editor def={d} filters={filters} set={set} facets={facets} onDone={close} />
          </Popover>
        );
      })}

      <Popover
        open={open === ADD}
        onClose={close}
        label={addingDef ? `${addingDef.label} filter` : "Add filter"}
        focusKey={adding}
        trigger={
          <button
            data-trigger
            aria-haspopup="dialog"
            aria-expanded={open === ADD}
            onClick={() => toggleOpen(ADD)}
            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-dashed border-faint px-2.5 text-[13px] text-muted transition-colors hover:border-label hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/15"
          >
            <Plus className="h-3.5 w-3.5" /> Add filter
          </button>
        }
      >
        {addingDef ? (
          <>
            <PanelHeader title={addingDef.label} hint={addingDef.kind === "pills" ? undefined : addingDef.hint} onBack={() => setAdding(null)} />
            <Editor def={addingDef} filters={filters} set={set} facets={facets} onDone={close} />
          </>
        ) : (
          <>
            <div className="border-b border-line-2 p-2">
              <SearchInput value={find} onChange={setFind} placeholder="Find a filter" />
            </div>
            <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto p-1">
              {GROUPS.map((g) => {
                const items = available.filter((d) => d.group === g);
                if (!items.length) return null;
                return (
                  <div key={g} className="pb-1">
                    <p className="px-2 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-faint">{g}</p>
                    {items.map((d) => (
                      <button
                        key={d.key}
                        data-nav
                        onClick={() => {
                          if (d.kind === "bool") {
                            set({ [d.key]: true });
                            close();
                          } else setAdding(d.key);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[13px] hover:bg-black/[0.035] focus-visible:bg-black/[0.05] focus-visible:outline-none",
                          isExclude(d) ? "text-pencil" : "text-ink",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{d.label}</span>
                        {d.kind === "bool" && <span className="text-[11.5px] text-label">{d.yes}</span>}
                      </button>
                    ))}
                  </div>
                );
              })}
              {!available.length && <p className="px-2 py-3 text-[12.5px] text-label">{needle ? "No filter matches that" : "Every filter is in use"}</p>}
            </div>
          </>
        )}
      </Popover>

      {anySet && (
        <button
          onClick={() => {
            close();
            onChange({});
          }}
          className="ml-auto h-8 rounded-[6px] px-2 text-[12.5px] text-label hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/15"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
