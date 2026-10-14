"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

/**
 * Where an investor asks to leave the directory. They enter their email, confirm from the link we send to
 * it (/remove?t=...), and are then hidden from search and from every founder's outreach.
 */
export default function RemovePage() {
  return (
    <Suspense fallback={null}>
      <Remove />
    </Suspense>
  );
}

function Remove() {
  const token = useSearchParams().get("t") ?? "";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4">
      <div className="w-full max-w-[440px] rounded-[10px] border border-line bg-panel p-6">{token ? <Confirm token={token} /> : <Request />}</div>
    </main>
  );
}

function Request() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const { error } = await createClient().functions.invoke("investor-removal", { body: { email } });
    setState(error ? "error" : "sent");
  }

  if (state === "sent") {
    return (
      <>
        <h1 className="text-[22px] tracking-[-0.03em]">Check your inbox</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          If {email} is in our directory, we have sent it a link to confirm your removal. The link works for 48 hours.
        </p>
      </>
    );
  }
  return (
    <form onSubmit={(e) => void submit(e)}>
      <h1 className="text-[22px] tracking-[-0.03em]">Remove yourself from Centrale</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        Centrale helps founders find and email investors. Enter the email address we hold for you and we will send it a link to confirm. Once you confirm, founders cannot find you or email you through Centrale.
      </p>
      <p className="mt-2 text-[13px] text-muted">
        How we hold investor details is explained in our <a href="/privacy#investors" className="underline">privacy policy</a>.
      </p>
      <Field label="Your email" className="mt-5">
        <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {state === "error" && <p className="mt-3 text-[13px] text-pencil">That did not work. Try again in a minute.</p>}
      <Button variant="primary" type="submit" className="mt-5 w-full" disabled={!email || state === "busy"}>
        {state === "busy" ? "Sending" : "Send confirmation link"}
      </Button>
    </form>
  );
}

function Confirm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "expired" | "error">("idle");

  async function confirm() {
    setState("busy");
    const { error } = await createClient().functions.invoke("investor-removal", { body: { token } });
    if (!error) return setState("done");
    const status = (error as { context?: Response }).context?.status;
    setState(status === 410 || status === 400 ? "expired" : "error");
  }

  if (state === "done") {
    return (
      <>
        <h1 className="text-[22px] tracking-[-0.03em]">You are removed</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Founders can no longer find you on Centrale, and nothing more will be sent to you through it. Anything already waiting to go out has been cancelled.
        </p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-[22px] tracking-[-0.03em]">Confirm your removal</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">This takes you out of the directory founders search on Centrale and stops all emails sent to you through it.</p>
      {state === "expired" && (
        <p className="mt-3 text-[13px] text-pencil">
          This link has expired. <a href="/remove" className="underline">Ask for a new one</a>.
        </p>
      )}
      {state === "error" && <p className="mt-3 text-[13px] text-pencil">That did not work. Try again in a minute.</p>}
      <Button variant="primary" className="mt-5 w-full" onClick={() => void confirm()} disabled={state === "busy" || state === "expired"}>
        {state === "busy" ? "Removing" : "Remove me"}
      </Button>
    </>
  );
}
