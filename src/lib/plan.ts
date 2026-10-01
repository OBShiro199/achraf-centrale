"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** The monthly plan's price as stored in public.plans, kept in step with the Whop plan. */
export function usePlanPrice() {
  const [price, setPrice] = useState<string | null>(null);
  useEffect(() => {
    void createClient()
      .from("plans")
      .select("price, currency")
      .eq("id", "monthly")
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.price) return;
        const amount = Number(data.price);
        setPrice(
          new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: (data.currency ?? "usd").toUpperCase(),
            maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
          }).format(amount),
        );
      });
  }, []);
  return price;
}
