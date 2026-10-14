"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * The page behind the unsubscribe link in every cold email sent through Centrale. It asks for one click
 * rather than unsubscribing on load, because mail scanners open links on their own.
 */
export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <Unsubscribe />
    </Suspense>
  );
}

function Unsubscribe() {
  const m = useSearchParams().get("m") ?? "";
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function confirm() {
    setState("busy");
    const { error } = await createClient().functions.invoke("unsubscribe", { body: { m } });
    setState(error ? "error" : "done");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4">
      <div className="w-full max-w-[420px] rounded-[10px] border border-line bg-panel p-6">
        {state === "done" ? (
          <>
            <h1 className="text-[22px] tracking-[-0.03em]">You are unsubscribed</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              You will not receive any more emails sent through Centrale to this address, from this sender or any other.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[22px] tracking-[-0.03em]">Unsubscribe</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              Stop all emails sent to you through Centrale, the tool this founder used to write to you. Anything still waiting to be sent is cancelled.
            </p>
            {!m && <p className="mt-3 text-[13px] text-pencil">This link is missing its code. Reply to the email and ask to be removed instead.</p>}
            {state === "error" && <p className="mt-3 text-[13px] text-pencil">That did not work. Try again, or reply to the email and ask to be removed.</p>}
            <Button variant="primary" className="mt-5 w-full" onClick={() => void confirm()} disabled={!m || state === "busy"}>
              {state === "busy" ? "Unsubscribing" : "Unsubscribe me"}
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
