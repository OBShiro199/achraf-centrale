"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Pill, Settle, Skeleton } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { BrandMark } from "@/components/landing/logo";
import { callFunction, createClient } from "@/lib/supabase/client";
import { useEntitlements } from "@/lib/directory";
import { cn } from "@/lib/utils";

interface Plan {
  id: "trial" | "starter" | "pro";
  name: string;
  price_gbp: number;
  max_rows: number | null;
  page_size_max: number;
  reveals_per_period: number;
  export_credits_per_period: number;
  daily_row_views: number;
  sort_order: number;
}

const n = (x: number) => x.toLocaleString("en-GB");

function lines(p: Plan) {
  return [
    p.max_rows ? `Browse the top ${n(p.max_rows)} results of any search` : "Browse every result, no page limit",
    `${n(p.reveals_per_period)} contact reveals ${p.id === "trial" ? "during the trial" : "a month"}`,
    p.export_credits_per_period ? `${n(p.export_credits_per_period)} export credits a month, CSV, Markdown or JSON` : "No exports",
    "Claude matching, drafting and follow-ups",
    "Your own sending inbox, 20 new emails a day",
    "AI pitch deck as a PDF",
  ];
}

function Meter({ label, used, total, note }: { label: string; used: number; total: number; note?: string }) {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-ink">{label}</span>
        <span className="tabular text-label">
          {n(used)} of {n(total)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-3">
        <div className={cn("h-full rounded-full", pct >= 90 ? "bg-vermilion" : "bg-burgundy")} style={{ width: `${pct}%` }} />
      </div>
      {note && <p className="mt-1 text-[11.5px] text-faint">{note}</p>}
    </div>
  );
}

export default function BillingPage() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { ent, reload } = useEntitlements();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [hasCustomer, setHasCustomer] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase
      .from("plans")
      .select("*")
      .order("sort_order")
      .then(({ data }) => setPlans((data as Plan[]) ?? []));
    void supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .maybeSingle()
      .then(({ data }) => setHasCustomer(Boolean(data?.stripe_customer_id)));
  }, []);

  // Back from Stripe: the webhook usually lands within seconds, so refresh the plan a few times.
  const checkout = params.get("checkout");
  useEffect(() => {
    if (checkout !== "success") return;
    toast({ title: "Payment received", body: "Your plan updates as soon as Stripe confirms it." });
    const timers = [1500, 4000, 9000].map((ms) => setTimeout(() => void reload(), ms));
    router.replace("/dashboard/billing");
    return () => timers.forEach(clearTimeout);
  }, [checkout, reload, router, toast]);

  async function go(action: "checkout" | "portal", plan?: string) {
    setBusy(plan ?? action);
    try {
      const { url } = await callFunction<{ url: string }>("billing", { action, plan });
      window.location.href = url;
    } catch (err) {
      toast({ title: "Could not open billing", body: err instanceof Error ? err.message : undefined, tone: "error" });
      setBusy(null);
    }
  }

  const status =
    ent?.status === "trialing"
      ? `Free trial, ${ent.trial_days_left ?? 0} day${ent.trial_days_left === 1 ? "" : "s"} left`
      : ent?.status === "expired"
        ? "Trial ended"
        : ent?.status === "past_due"
          ? `${ent.plan_name}, payment overdue`
          : ent
            ? `${ent.plan_name} plan`
            : null;

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 px-4 py-8 md:px-8">
      <Settle className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] tracking-[-0.04em]">Billing</h2>
          <p className="mt-1 text-[14px] text-muted">{status ?? <Skeleton className="inline-block h-3 w-40 align-middle" />}</p>
        </div>
        {hasCustomer && (
          <Button size="sm" onClick={() => void go("portal")} disabled={busy != null}>
            <ExternalLink className="h-3.5 w-3.5" /> {busy === "portal" ? "Opening" : "Manage billing"}
          </Button>
        )}
      </Settle>

      <Settle delay={40}>
        <Card>
          <CardHeader title="This period" sub={ent?.period_end ? `Resets ${new Date(ent.period_end).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : undefined} />
          <div className="grid gap-5 p-5 md:grid-cols-3">
            {ent ? (
              <>
                <Meter label="Contact reveals" used={ent.reveals_total - ent.reveals_left} total={ent.reveals_total} />
                <Meter
                  label="Export credits"
                  used={ent.exports_total - ent.exports_left}
                  total={ent.exports_total}
                  note={ent.exports_total ? undefined : "Exports come with Starter and Pro"}
                />
                <Meter label="Investors viewed today" used={ent.rows_viewed_today} total={ent.daily_row_views} note="Resets at midnight UTC" />
              </>
            ) : (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)
            )}
          </div>
        </Card>
      </Settle>

      <Settle delay={80} className="grid gap-4 md:grid-cols-3">
        {(plans ?? []).map((p) => {
          const current = ent?.plan_id === p.id && ent.status !== "expired";
          const featured = p.id === "starter";
          return (
            <Card key={p.id} className={cn("flex flex-col p-5", featured && "border-[#c9b3a8] shadow-[0_18px_40px_-28px_rgba(57,28,37,0.35)]")}>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                  <BrandMark className="h-3.5 w-3.5" color={featured ? "var(--color-vermilion)" : "var(--color-burgundy)"} />
                  {p.name}
                </p>
                {current ? <Pill tone="green">Current</Pill> : featured ? <Pill tone="red">Most founders</Pill> : null}
              </div>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="display tabular text-[38px] leading-none tracking-[-0.05em] text-display">£{p.price_gbp}</span>
                <span className="text-[13px] text-muted">{p.id === "trial" ? "for 7 days" : "a month"}</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2">
                {lines(p).map((l) => (
                  <li key={l} className="flex gap-2 text-[13px] text-body">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green" strokeWidth={2.4} />
                    {l}
                  </li>
                ))}
              </ul>
              {p.id === "trial" ? (
                <Button className="mt-6 w-full" disabled>
                  {ent?.status === "expired" ? "Trial used" : "Included on sign up"}
                </Button>
              ) : (
                <Button
                  variant={featured ? "primary" : "secondary"}
                  className="mt-6 w-full"
                  disabled={busy != null || (current && ent?.status === "active")}
                  onClick={() => void (hasCustomer && ent?.plan_id !== "trial" ? go("portal") : go("checkout", p.id))}
                >
                  {busy === p.id ? "Opening checkout" : current ? "Your plan" : ent?.plan_id !== "trial" && hasCustomer ? `Switch to ${p.name}` : `Choose ${p.name}`}
                </Button>
              )}
            </Card>
          );
        })}
        {!plans && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[380px] w-full rounded-[10px]" />)}
      </Settle>

      <Settle delay={120}>
        <p className="text-center text-[12.5px] text-label">
          Paying during the free trial keeps the rest of it: your first charge is on the day the trial would have ended. Cancel any time from Manage
          billing.
        </p>
      </Settle>
    </div>
  );
}
