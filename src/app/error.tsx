"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusScreen } from "@/components/app/status-screen";

/** Catches anything a page throws, so a founder sees a way forward instead of a blank screen. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      title="Something went wrong on this page"
      body={
        <>
          Your work is saved. Try again, and if it keeps happening, write to us
          {error.digest ? <> quoting reference {error.digest}</> : null}.
        </>
      }
    >
      <Button variant="primary" onClick={() => retry()}>
        Try again
      </Button>
      <ButtonLink href="/dashboard">Open your dashboard</ButtonLink>
    </StatusScreen>
  );
}
