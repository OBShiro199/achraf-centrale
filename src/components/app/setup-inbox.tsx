"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/landing/logo";
import { callFunction } from "@/lib/supabase/client";

/** Retries inbox provisioning for founders whose inbox could not be created at signup. */
export function SetupInboxButton({ size = "sm", onError }: { size?: "sm" | "md"; onError?: (msg: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size={size}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await callFunction("provision-inbox");
          router.refresh();
          window.location.reload();
        } catch (e) {
          onError?.(e instanceof Error ? e.message : "Could not create an inbox");
          setBusy(false);
        }
      }}
    >
      {busy ? <BrandMark className="h-3.5 w-3.5" pulse /> : null}
      {busy ? "Setting up" : "Set up inbox"}
    </Button>
  );
}
