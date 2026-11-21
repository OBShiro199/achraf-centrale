"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type PlanId = "monthly" | "quarterly";

export interface PlanPrice {
  id: PlanId;
  name: string;
  /** "$129" */
  price: string;
  months: number;
  /** What it works out at per month, "$83". */
  perMonth: string;
}

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);

/** The two plans as stored in public.plans, kept in step with the Whop plans. Monthly first. */
export function usePlans() {
  const [plans, setPlans] = useState<PlanPrice[] | null>(null);
  useEffect(() => {
    void createClient()
      .from("plans")
      .select("id, name, price, currency, period_months")
      .in("id", ["monthly", "quarterly"])
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => {
        setPlans(
          (data ?? []).map((p) => {
            const amount = Number(p.price);
            const months = Number(p.period_months) || 1;
            return {
              id: p.id as PlanId,
              name: p.name as string,
              price: money(amount, p.currency ?? "usd"),
              months,
              perMonth: money(Math.round(amount / months), p.currency ?? "usd"),
            };
          }),
        );
      });
  }, []);
  return plans;
}
