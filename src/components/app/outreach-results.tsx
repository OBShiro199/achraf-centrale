"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/kit";
import { createClient } from "@/lib/supabase/client";
import { REGIONS, ROLES } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

interface Breakdown {
  totals: { contacted: number; opened: number; replied: number; meetings: number };
  groups: { dim: Dim; value: string; contacted: number; replied: number; meetings: number }[];
}
type Dim = "sector" | "stage" | "region" | "role";

const DIMS: { key: Dim; label: string }[] = [
  { key: "sector", label: "Sector" },
  { key: "stage", label: "Stage" },
  { key: "region", label: "Region" },
  { key: "role", label: "Role" },
];

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "0%");

function display(dim: Dim, value: string) {
  if (dim === "region") return REGIONS[value] ?? value;
  if (dim === "role") return ROLES[value] ?? value;
  return value;
}

/** Reply and meeting rates for the founder's own outreach, by the kind of investor emailed. */
export function OutreachResults() {
  const [data, setData] = useState<Breakdown | null>(null);
  const [dim, setDim] = useState<Dim>("sector");

  useEffect(() => {
    void createClient()
      .rpc("outreach_breakdown")
      .then(({ data: d }) => setData((d as Breakdown | null) ?? null));
  }, []);

  if (!data || data.totals.contacted === 0) return null;
  const t = data.totals;
  const rows = data.groups.filter((g) => g.dim === dim).slice(0, 12);
  const best = Math.max(0, ...rows.map((r) => r.replied / r.contacted));

  return (
    <Card>
      <CardHeader title="What is working" sub="Of the investors you emailed. Opens are approximate, since some mail apps open every email." />
      <div className="grid grid-cols-2 gap-4 border-b border-line p-5 sm:grid-cols-4">
        {[
          ["Emailed", String(t.contacted), ""],
          ["Opened", pct(t.opened, t.contacted), `${t.opened}`],
          ["Replied", pct(t.replied, t.contacted), `${t.replied}`],
          ["Meetings", pct(t.meetings, t.contacted), `${t.meetings}`],
        ].map(([label, value, sub]) => (
          <div key={label}>
            <p className="text-[12px] text-label">{label}</p>
            <p className="tabular text-[22px] font-semibold tracking-[-0.03em] text-ink">
              {value}
              {sub && <span className="ml-1.5 text-[12px] font-normal text-label">{sub}</span>}
            </p>
          </div>
        ))}
      </div>
      <div className="flex gap-1 px-5 pt-4" role="tablist">
        {DIMS.map((d) => (
          <button
            key={d.key}
            role="tab"
            aria-selected={dim === d.key}
            onClick={() => setDim(d.key)}
            className={cn("rounded-[6px] px-2.5 py-1 text-[12.5px]", dim === d.key ? "bg-burgundy text-ivory" : "text-muted hover:bg-black/[0.04]")}
          >
            {d.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-muted">Rates show once you have emailed 3 or more investors in a group.</p>
      ) : (
        <table className="mt-2 w-full text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-label">
              <th className="px-5 py-2 font-medium">{DIMS.find((d) => d.key === dim)?.label}</th>
              <th className="px-3 py-2 text-right font-medium">Emailed</th>
              <th className="px-3 py-2 text-right font-medium">Replied</th>
              <th className="px-5 py-2 text-right font-medium">Meetings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-2">
            {rows.map((r) => (
              <tr key={r.value}>
                <td className="px-5 py-2 text-body">{display(dim, r.value)}</td>
                <td className="tabular px-3 py-2 text-right text-muted">{r.contacted}</td>
                <td className={cn("tabular px-3 py-2 text-right", best > 0 && r.replied / r.contacted === best ? "font-semibold text-green" : "text-ink")}>
                  {pct(r.replied, r.contacted)}
                </td>
                <td className="tabular px-5 py-2 text-right text-ink">{pct(r.meetings, r.contacted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
