import type { ReactNode } from "react";
import { Callout } from "@/components/docs/blocks";
import { Footer } from "@/components/landing/closing";
import { Nav } from "@/components/landing/nav";
import { LEGAL_UPDATED } from "@/content/legal";

/** Layout for /terms and /privacy: the landing header and footer around a readable column. */
export function LegalPage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <>
      <Nav />
      <main className="bg-paper px-4 py-12 md:py-16">
        <article className="mx-auto max-w-[720px] space-y-4">
          <p className="text-[12.5px] text-label">Last updated {LEGAL_UPDATED}</p>
          <h1 className="text-[34px] leading-[1.1] tracking-[-0.04em] text-ink">{title}</h1>
          <p className="text-[16px] leading-relaxed text-muted">{lead}</p>
          <Callout tone="note">This version is awaiting legal review and may change. We will update the date above when it does.</Callout>
          <div className="space-y-4 pt-2">{children}</div>
        </article>
      </main>
      <Footer />
    </>
  );
}

/** A numbered section heading with an anchor. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3 pt-6">
      <h2 className="text-[20px] tracking-[-0.03em] text-ink">{title}</h2>
      {children}
    </section>
  );
}
