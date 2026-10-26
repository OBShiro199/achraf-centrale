"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

/** Sends a password reset link. Answers the same whether or not the address has an account. */
export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("busy");
    const { error: sendError } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset`,
    });
    // Rate limits are the only error worth showing; anything else would reveal whether the account exists.
    if (sendError && /rate|seconds|too many/i.test(sendError.message)) {
      setError("Too many requests. Wait a minute and try again.");
      setState("idle");
      return;
    }
    setState("sent");
  }

  return (
    <AuthShell
      title={state === "sent" ? "Check your inbox" : "Reset your password"}
      lead={
        state === "sent"
          ? `If ${email.trim()} has an account, a link to choose a new password is on its way. It works once and expires in an hour.`
          : "Enter your login email and we will send you a link to choose a new password."
      }
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
            Log in
          </Link>
        </>
      }
    >
      {state !== "sent" && (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </Field>
          <FormError>{error}</FormError>
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={state === "busy"}>
            {state === "busy" ? "Sending" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
