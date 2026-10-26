import type { ReactNode } from "react";
import { BrandMark } from "@/components/landing/logo";

/** A calm full-height card for 404s and crashes: mark, heading, one line, actions. */
export function StatusScreen({ code, title, body, children }: { code?: string; title: string; body: ReactNode; children?: ReactNode }) {
  return (
    <main className="flex min-h-[70dvh] items-center justify-center bg-paper px-4 py-16">
      <div className="w-full max-w-[440px] text-center">
        <BrandMark className="mx-auto h-9 w-9" />
        {code && <p className="mt-6 text-[12.5px] font-medium tracking-[0.12em] text-label">{code}</p>}
        <h1 className="mt-2 text-[26px] leading-tight tracking-[-0.04em] text-ink">{title}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{body}</p>
        {children && <div className="mt-7 flex flex-wrap items-center justify-center gap-2">{children}</div>}
      </div>
    </main>
  );
}
