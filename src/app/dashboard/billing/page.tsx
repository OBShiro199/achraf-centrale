"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Pill, Settle } from "@/components/ui/kit";
import { BrandMark } from "@/components/landing/logo";
import { cn } from "@/lib/utils";

const PLANS = [
  { name: "Starter", price: 49, lines: ["20 first emails a day", "Full investor matching", "Claude drafts for every email", "Unified inbox"] },
  { name: "Growth", price: 99, lines: ["60 first emails a day across two inboxes", "Follow-ups after three days", "Open tracking", "Everything in Starter"], featured: true },
  { name: "Scale", price: 199, lines: ["150 first emails a day", "Investor mobile numbers for WhatsApp", "Inbox rotation after month one", "Everything in Growth"] },
];

export default function BillingPage() {
  return (
    <div className="mx-auto max-w-[1000px] space-y-5 px-4 py-8 md:px-8">
      <Settle className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] tracking-[-0.04em]">Billing</h2>
          <p className="mt-1 text-[14px] text-muted">You are on the founder trial. Checkout connects in the next build.</p>
        </div>
        <Pill tone="burgundy">Founder trial</Pill>
      </Settle>

      <Settle delay={60} className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <Card key={p.name} className={cn("flex flex-col p-5", p.featured && "border-[#c9b3a8] shadow-[0_18px_40px_-28px_rgba(57,28,37,0.35)]")}>
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                <BrandMark className="h-3.5 w-3.5" color={p.featured ? "var(--color-vermilion)" : "var(--color-burgundy)"} />
                {p.name}
              </p>
              {p.featured && <Pill tone="red">Most founders</Pill>}
            </div>
            <p className="mt-4 flex items-baseline gap-1">
              <span className="display tabular text-[38px] leading-none tracking-[-0.05em] text-display">${p.price}</span>
              <span className="text-[13px] text-muted">a month</span>
            </p>
            <ul className="mt-5 flex-1 space-y-2">
              {p.lines.map((l) => (
                <li key={l} className="flex gap-2 text-[13px] text-body">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green" strokeWidth={2.4} />
                  {l}
                </li>
              ))}
            </ul>
            <Button variant={p.featured ? "primary" : "secondary"} className="mt-6 w-full" disabled>
              Checkout opens soon
            </Button>
          </Card>
        ))}
      </Settle>

      <Settle delay={120}>
        <Card>
          <CardHeader title="Investor list export" sub="One payment, no subscription" />
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="max-w-[520px] text-[13.5px] text-muted">
              Download the full combined investor list with stage, sector, cheque size, portfolio and contact details, as CSV.
            </p>
            <div className="flex items-center gap-4">
              <span className="display tabular text-[26px] tracking-[-0.04em] text-display">$499</span>
              <Button disabled>Coming soon</Button>
            </div>
          </div>
        </Card>
      </Settle>
    </div>
  );
}
