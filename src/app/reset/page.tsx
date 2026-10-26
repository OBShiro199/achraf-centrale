"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

/**
 * Where the reset email lands. The link signs the founder in for this one purpose (a ?code= exchanged here,
 * in the same browser that asked for it); they then choose a new password and go to the dashboard.
 */
export default function ResetPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "expired">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const code = new URLSearchParams(window.location.search).get("code");
    (async () => {
      if (code) await supabase.auth.exchangeCodeForSession(code).catch(() => null);
      const { data } = await supabase.auth.getSession();
      setReady(data.session ? "ok" : "expired");
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) {
      setError(/different from the old/i.test(updateError.message) ? "Choose a password you have not used before." : updateError.message);
      setBusy(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  const footer = (
    <>
      Back to{" "}
      <Link href="/login" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
        log in
      </Link>
    </>
  );

  if (ready === "expired") {
    return (
      <AuthShell title="This link has expired" lead="Reset links work once, for an hour, in the browser you asked from. Ask for a new one." footer={footer}>
        <Link href="/forgot" className="block">
          <Button variant="primary" size="lg" className="w-full">
            Send a new link
          </Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" lead="At least 8 characters. You will be signed in when it is saved." footer={footer}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="New password">
          <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={ready !== "ok"} />
        </Field>
        <Field label="Type it again">
          <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={ready !== "ok"} />
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || ready !== "ok"}>
          {ready === "checking" ? "Checking your link" : busy ? "Saving" : "Save password"}
        </Button>
      </form>
    </AuthShell>
  );
}
