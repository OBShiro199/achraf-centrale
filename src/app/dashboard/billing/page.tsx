"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ExternalLink } from "lucide-react";
import { useApp } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Pill, Settle, Skeleton } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { BrandMark } from "@/components/landing/logo";
import { callFunction } from "@/lib/supabase/client";
import { usePlanPrice } from "@/lib/plan";
import { cn } from "@/lib/utils";

const n = (x: number) => x.toLocaleString("en-GB");

const INCLUDED = [
  "Your own sending inbox, 20 new emails a day while it warms up",
  "Claude matching, drafting and automatic follow-ups",
  "2,500 contact reveals and 2,500 export credits a month",
  "The full investor database, no page limit",
  "AI pitch deck as a PDF",
];

function Meter({ label, used, total, note }: { label: string; used: number; total: number; note?: string }) {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-ink">{label}</span>
        <span className="tabular text-label">{total ? `${n(used)} of ${n(total)}` : "Not in the trial"}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-3">
        <div className={cn("h-full rounded-full", pct >= 90 ? "bg-vermilion" : "bg-burgundy")} style={{ width: `${pct}%` }} />
      </div>
      {note && <p className="mt-1 text-[11.5px] text-faint">{note}</p>}
    </div>
  );
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : null);

export default function BillingPage() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { ent, reloadEnt } = useApp();
  const [busy, setBusy] = useState<"checkout" | "manage" | null>(null);
  const price = usePlanPrice();

  const checkout = params.get("checkout");
  useEffect(() => {
    if (checkout !== "success") return;
    toast({ title: "Payment received", body: "Your plan updates as soon as Whop confirms it." });
    const timers = [1500, 4000, 9000].map((ms) => setTimeout(() => void reloadEnt(), ms));
    router.replace("/dashboard/billing");
    return () => timers.forEach(clearTimeout);
  }, [checkout, reloadEnt, router, toast]);

  async function go(action: "checkout" | "manage") {
    setBusy(action);
    try {
      const { url } = await callFunction<{ url: string }>("whop", { action });
      window.location.href = url;
    } catch (err) {
      toast({ title: "Could not open billing", body: err instanceof Error ? err.message : undefined, tone: "error" });
      setBusy(null);
    }
  }

  const status = !ent
    ? null
    : ent.status === "trialing"
      ? `Free trial, ${ent.trial_days_left ?? 0} day${ent.trial_days_left === 1 ? "" : "s"} left. Your plan starts on ${fmtDate(ent.trial_ends_at) ?? "the day it ends"}.`
      : ent.status === "active"
        ? `Centrale plan, renews ${fmtDate(ent.period_end) ?? "monthly"}.`
        : ent.status === "past_due"
          ? "Your last payment did not go through. Update your card to keep sending."
          : ent.status === "pending"
            ? "Start your free trial to begin."
            : "Your plan has ended. Start it again to send.";

  const hasMembership = ent && ["trialing", "active", "past_due"].includes(ent.status);

  return (
    <div className="mx-auto max-w-[860px] space-y-5 px-4 py-8 md:px-8">
      <Settle className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] tracking-[-0.04em]">Billing</h2>
          <p className="mt-1 text-[14px] text-muted">{status ?? <Skeleton className="inline-block h-3 w-56 align-middle" />}</p>
        </div>
        {hasMembership && (
          <Button size="sm" onClick={() => void go("manage")} disabled={busy != null}>
            <ExternalLink className="h-3.5 w-3.5" /> {busy === "manage" ? "Opening" : "Manage subscription"}
          </Button>
        )}
      </Settle>

      <Settle delay={40}>
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                <BrandMark className="h-3.5 w-3.5" color="var(--color-vermilion)" />
                Centrale
              </p>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="display tabular text-[42px] leading-none tracking-[-0.05em] text-display">{price ?? "\u00a0"}</span>
                <span className="text-[13px] text-muted">a month, after a 7-day free trial</span>
              </p>
            </div>
            {ent?.status === "active" ? (
              <Pill tone="green">Active</Pill>
            ) : ent?.status === "trialing" ? (
              <Pill tone="amber">Trial</Pill>
            ) : ent?.status === "past_due" ? (
              <Pill tone="red">Payment overdue</Pill>
            ) : null}
          </div>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {INCLUDED.map((l) => (
              <li key={l} className="flex gap-2 text-[13px] text-body">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green" strokeWidth={2.4} />
                {l}
              </li>
            ))}
          </ul>
          {ent && !hasMembership && (
            <Button variant="primary" className="mt-6" onClick={() => void go("checkout")} disabled={busy != null}>
              {busy === "checkout" ? "Opening checkout" : ent.status === "pending" ? "Start free trial" : "Start your plan"}
            </Button>
          )}
          {ent?.status === "trialing" && (
            <p className="mt-5 text-[12.5px] text-label">
              During the trial you can build your profile and deck and browse investors with contact details truncated. Your sending inbox, sending,
              reveals and exports start with your plan. To cancel before you are charged, use Manage subscription.
            </p>
          )}
        </Card>
      </Settle>

      {ent?.paid && (
        <Settle delay={80}>
          <Card>
            <CardHeader title="This period" sub={ent.period_end ? `Resets ${fmtDate(ent.period_end)}` : undefined} />
            <div className="grid gap-5 p-5 md:grid-cols-3">
              <Meter label="Contact reveals" used={ent.reveals_total - ent.reveals_left} total={ent.reveals_total} />
              <Meter label="Export credits" used={ent.exports_total - ent.exports_left} total={ent.exports_total} />
              <Meter label="Investors viewed today" used={ent.rows_viewed_today} total={ent.daily_row_views} note="Resets at midnight UTC" />
            </div>
          </Card>
        </Settle>
      )}
    </div>
  );
}
