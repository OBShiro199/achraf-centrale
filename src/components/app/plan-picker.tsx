"use client";

import { useEffect } from "react";
import { Skeleton } from "@/components/ui/kit";
import { usePlans, type PlanId } from "@/lib/plan";
import { cn } from "@/lib/utils";

/**
 * The two plans side by side. Quarterly is the default: most raises take three to six months, and it works out
 * cheaper per month.
 */
export function PlanPicker({ value, onChange }: { value: PlanId; onChange: (id: PlanId) => void }) {
  const plans = usePlans();
  const monthly = plans?.find((p) => p.id === "monthly");

  // If the chosen plan is not on offer, choose one that is (quarterly when it exists).
  useEffect(() => {
    if (plans?.length && !plans.some((p) => p.id === value)) onChange((plans.find((p) => p.id === "quarterly") ?? plans[0]).id);
  }, [plans, value, onChange]);

  if (!plans) {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        <Skeleton className="h-[92px] rounded-[10px]" />
        <Skeleton className="h-[92px] rounded-[10px]" />
      </div>
    );
  }

  if (!plans.length) return <p className="text-[13px] text-muted">Plans are being set up. Try again shortly.</p>;

  return (
    <div role="radiogroup" aria-label="Plan" className={cn("grid gap-2.5", plans.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
      {plans.map((p) => {
        const selected = p.id === value;
        const saving = monthly && p.months > 1 ? Math.round((1 - Number(p.perMonth.replace(/[^0-9.]/g, "")) / Number(monthly.price.replace(/[^0-9.]/g, ""))) * 100) : 0;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(p.id)}
            className={cn(
              "relative rounded-[10px] border bg-panel p-3.5 text-left transition-colors",
              selected ? "border-ink ring-1 ring-ink" : "border-line hover:border-label",
            )}
          >
            {saving > 0 && (
              <span className="absolute -top-2.5 right-3 rounded-full bg-vermilion px-2 py-0.5 text-[11px] font-medium text-ivory">
                Save {saving}%
              </span>
            )}
            <span className="block text-[13px] text-muted">{p.months === 1 ? "Monthly" : `Every ${p.months} months`}</span>
            <span className="mt-1 flex items-baseline gap-1">
              <span className="display tabular text-[26px] leading-none tracking-[-0.04em] text-display">{p.price}</span>
              <span className="text-[12px] text-label">{p.months === 1 ? "a month" : `per ${p.months} months`}</span>
            </span>
            <span className="mt-1.5 block text-[12px] text-label">{p.months === 1 ? "Cancel any time" : `${p.perMonth} a month, one raise`}</span>
          </button>
        );
      })}
    </div>
  );
}
