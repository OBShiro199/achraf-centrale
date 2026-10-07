// Building blocks for the in-app docs. No hooks here, so docs content renders on the server and
// src/components/docs/text.ts can read its words for search.
import Link from "next/link";
import type { ReactNode } from "react";
import { Info, Lightbulb, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[14.5px] leading-[1.7] text-body", className)}>{children}</p>;
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="pt-3 font-sans text-[15.5px] font-semibold tracking-[-0.015em] text-ink">{children}</h3>;
}

export function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-ink">{children}</strong>;
}

/** Inline code, DNS values, button names a founder types or copies. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[4px] border border-line-2 bg-panel-2 px-1 py-px font-mono text-[12.5px] text-ink [overflow-wrap:anywhere]">
      {children}
    </code>
  );
}

/** A link inside the app or to a docs anchor. */
export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-ink underline decoration-faint underline-offset-[3px] hover:decoration-vermilion">
      {children}
    </Link>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[14.5px] leading-[1.65] text-body">
          <span aria-hidden className="mt-[0.7em] h-[5px] w-[5px] shrink-0 rounded-full bg-faint" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Steps({ items }: { items: { title: ReactNode; body?: ReactNode }[] }) {
  return (
    <ol className="relative space-y-4">
      {items.map((s, i) => (
        <li key={i} className="relative flex gap-3.5">
          {i < items.length - 1 && <span aria-hidden className="absolute bottom-[-16px] left-[11.5px] top-7 w-px bg-line" />}
          <span className="tabular relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-[12px] font-semibold text-burgundy">
            {i + 1}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-[14.5px] font-medium leading-[1.5] text-ink">{s.title}</p>
            {s.body && <div className="mt-1 text-[14px] leading-[1.65] text-muted">{s.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

type CalloutTone = "note" | "warning" | "tip";
const calloutStyle: Record<CalloutTone, { box: string; icon: string; Icon: typeof Info }> = {
  note: { box: "border-line bg-panel-2", icon: "text-muted", Icon: Info },
  warning: { box: "border-pencil/20 bg-pencil-soft/50", icon: "text-pencil", Icon: TriangleAlert },
  tip: { box: "border-green/20 bg-green-soft/60", icon: "text-green", Icon: Lightbulb },
};

export function Callout({ tone = "note", title, children }: { tone?: CalloutTone; title?: ReactNode; children: ReactNode }) {
  const s = calloutStyle[tone];
  return (
    <div className={cn("flex gap-3 rounded-[8px] border px-4 py-3.5", s.box)}>
      <s.Icon className={cn("mt-[3px] h-4 w-4 shrink-0", s.icon)} strokeWidth={2} />
      <div className="min-w-0 text-[14px] leading-[1.65] text-body">
        {title && <p className="mb-0.5 font-semibold text-ink">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function Table({ head, rows, caption }: { head: ReactNode[]; rows: ReactNode[][]; caption?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-line bg-panel">
      <div className="quiet-scroll overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-line-2 bg-panel-2">
              {head.map((h, i) => (
                <th key={i} scope="col" className="px-4 py-2.5 text-[12px] font-medium text-label">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line-3 last:border-b-0">
                {r.map((c, j) => (
                  <td key={j} className={cn("px-4 py-2.5 align-top leading-[1.55]", j === 0 ? "font-medium text-ink" : "tabular text-body")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption && <p className="border-t border-line-2 px-4 py-2 text-[12px] text-label">{caption}</p>}
    </div>
  );
}

/** A row of headline numbers, like the meters on the Billing page. */
export function Figures({ items }: { items: { value: ReactNode; label: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-line sm:grid-cols-4">
      {items.map((f, i) => (
        <div key={i} className="bg-panel px-4 py-3.5">
          <p className="display tabular text-[24px] leading-none tracking-[-0.04em] text-display">{f.value}</p>
          <p className="mt-1.5 text-[12px] leading-snug text-label">{f.label}</p>
        </div>
      ))}
    </div>
  );
}

export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="divide-y divide-line-2 overflow-hidden rounded-[8px] border border-line bg-panel">
      {items.map((f) => (
        <details key={f.q} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-[14px] font-medium text-ink hover:bg-panel-2 [&::-webkit-details-marker]:hidden">
            {f.q}
            <span aria-hidden className="text-[16px] leading-none text-label transition-transform duration-200 group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="px-4 pb-4 text-[14px] leading-[1.65] text-muted">{f.a}</div>
        </details>
      ))}
    </div>
  );
}

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function Changelog({ entries }: { entries: { date: string; items: ReactNode[] }[] }) {
  return (
    <ol className="space-y-5">
      {entries.map((e) => (
        <li key={e.date} className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-5">
          <time dateTime={e.date} className="tabular pt-0.5 text-[12.5px] font-medium text-label">
            {fmtDay(e.date)}
          </time>
          <Bullets items={e.items} />
        </li>
      ))}
    </ol>
  );
}
