"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { Loader } from "@/components/ui/kit";
import { callFunction, createClient } from "@/lib/supabase/client";
import { usePlanPrice } from "@/lib/plan";

const TRIAL = [
  "Your startup profile, written from your website",
  "An AI pitch deck as a PDF",
  "Browse the investor database and see your best matches",
];
const PAID = ["Your own sending inbox", "Email investors, with automatic follow-ups", "Reveal and export contact details"];

/** Where a founder goes next once their trial has started. */
async function nextPath() {
  const { data } = await createClient().from("startups").select("onboarding_completed_at").maybeSingle();
  return data?.onboarding_completed_at ? "/dashboard" : "/onboarding";
}

/**
 * Card up front: every account starts its 7-day trial through Whop checkout before onboarding.
 * After checkout Whop sends the founder back here, and this page waits for the webhook to record the trial.
 */
export default function StartPage() {
  return (
    <Suspense fallback={null}>
      <Start />
    </Suspense>
  );
}

function Start() {
  const router = useRouter();
  const params = useSearchParams();
  const returning = params.get("checkout") === "done";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(returning);
  const [slow, setSlow] = useState(false);
  const polls = useRef(0);
  const price = usePlanPrice();

  // Founders who already have a trial or plan never see this page.
  useEffect(() => {
    let live = true;
    const check = async () => {
      const { data } = await createClient().from("subscriptions").select("status").maybeSingle();
      if (!live) return;
      if (data && data.status !== "pending" && data.status !== "canceled" && data.status !== "expired") {
        router.replace(await nextPath());
        return;
      }
      if (returning) {
        polls.current += 1;
        if (polls.current === 10) setSlow(true);
        if (polls.current < 40) setTimeout(() => void check(), 1500);
        else setWaiting(false);
      }
    };
    void check();
    return () => {
      live = false;
    };
  }, [returning, router]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await callFunction<{ url: string }>("whop", { action: "checkout" });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open checkout");
      setBusy(false);
    }
  }

  if (waiting) {
    return (
      <AuthShell title="Starting your trial" lead="Confirming your card with Whop. This usually takes a few seconds." footer={null}>
        <Loader label={slow ? "Still waiting for Whop to confirm. You can leave this page open." : "Setting up your account"} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Start your 7-day free trial"
      lead={`Add a card to begin. Nothing is charged today; Centrale is ${price ?? "billed monthly"}${price ? " a month" : ""} after the trial, and you can cancel any time before it ends.`}
      footer={<span className="text-[13px] text-label">Payments are handled by Whop.</span>}
    >
      <div className="space-y-5">
        <div>
          <p className="text-[12.5px] font-medium text-ink">During the trial</p>
          <ul className="mt-2 space-y-1.5">
            {TRIAL.map((l) => (
              <li key={l} className="flex gap-2 text-[13.5px] text-body">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green" strokeWidth={2.4} />
                {l}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[12.5px] font-medium text-ink">When your plan starts</p>
          <ul className="mt-2 space-y-1.5">
            {PAID.map((l) => (
              <li key={l} className="flex gap-2 text-[13.5px] text-muted">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-label" strokeWidth={2.4} />
                {l}
              </li>
            ))}
          </ul>
        </div>
        {returning && !waiting && (
          <FormError>We have not heard back from Whop yet. If you finished checkout, refresh in a minute; otherwise start again below.</FormError>
        )}
        <FormError>{error}</FormError>
        <Button variant="primary" size="lg" className="w-full" onClick={() => void start()} disabled={busy}>
          {busy ? "Opening checkout" : "Start free trial"}
        </Button>
      </div>
    </AuthShell>
  );
}
