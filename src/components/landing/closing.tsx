import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/sketch/reveal";
import { ScribbleBox } from "@/components/sketch/draw";
import { Convergence } from "@/components/sketch/convergence";
import { BrandMark, Wordmark } from "./logo";
import { TAGLINE } from "@/lib/utils";

export function Closing() {
  return (
    <section className="graph-paper border-b border-line">
      <div className="rail relative grid items-center gap-12 px-4 py-24 md:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
        <div>
          <Reveal>
            <p className="eyebrow">
              <b>Q.E.D.</b>
              Built for founders
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="mt-5 text-[clamp(38px,5.2vw,68px)] leading-[0.98] tracking-[-0.05em] text-display">
              Your next round
              <br />
              <span className="text-vermilion">starts here.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 max-w-[460px] text-[17px] leading-relaxed text-muted">
              {TAGLINE} Sign up, answer five questions and send your first investor email in fifteen minutes.
            </p>
          </Reveal>
          <Reveal delay={0.24} className="relative mt-10 inline-flex flex-wrap gap-3 p-4">
            <ScribbleBox className="pointer-events-none absolute inset-0 h-full w-full" delay={0.6} />
            <ButtonLink href="/signup" variant="primary" size="lg" square>
              Start your raise
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary" size="lg" square>
              Log in
            </ButtonLink>
          </Reveal>
        </div>
        <Reveal delay={0.2} className="mx-auto w-full max-w-[440px]">
          <Convergence className="w-full overflow-visible" />
        </Reveal>
        <span className="absolute bottom-6 right-6 inline-block h-3.5 w-3.5 bg-ink md:right-10" aria-hidden />
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="rail flex flex-col gap-6 px-4 py-10 text-[13.5px] text-label md:flex-row md:items-center md:justify-between md:px-8">
        <Wordmark className="h-5" />
        <p className="flex items-center gap-2">
          <BrandMark className="h-3 w-3" />
          {TAGLINE}
        </p>
        <div className="flex gap-6">
          <a href="#faq" className="hover:text-ink">
            Questions
          </a>
          <a href="mailto:hello@omail.sh" className="hover:text-ink">
            Contact
          </a>
          <span>© 2026 Centrale</span>
        </div>
      </div>
    </footer>
  );
}
