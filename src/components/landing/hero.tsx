"use client";

import { motion } from "motion/react";
import { ButtonLink } from "@/components/ui/button";
import { Mark } from "@/components/sketch/mark";
import { ScribbleArrow } from "@/components/sketch/draw";
import { Hand } from "@/components/sketch/hand";
import { FitFigure } from "./fit-figure";
import { BrandMark } from "./logo";

const ease = [0.22, 0.61, 0.21, 1] as const;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 26, filter: "blur(7px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.9, delay, ease },
});

export function Hero() {
  return (
    <section className="graph-paper relative overflow-hidden border-b border-line">
      <div className="rail relative grid gap-12 px-4 pb-14 pt-14 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pb-20 lg:pt-20 [&>*]:min-w-0">
        <span className="pointer-events-none absolute left-4 top-4 text-[11.5px] text-faint md:left-8">Chapter 1</span>
        <span className="pointer-events-none absolute right-4 top-4 text-[11.5px] text-faint md:right-8">p. 1</span>

        <div className="relative flex flex-col justify-center">
          <motion.div {...rise(0)}>
            <span className="relative inline-flex overflow-hidden rounded-full p-px">
              <span
                className="absolute inset-[-100%] animate-[spin-slow_6s_linear_infinite]"
                style={{ background: "conic-gradient(from 0deg, transparent 0 70%, #d94a38 85%, transparent 100%)" }}
              />
              <span className="relative inline-flex items-center gap-2 rounded-full bg-panel px-3 py-1 text-[12.5px] text-muted">
                <BrandMark className="h-3 w-3" assemble delay={0.4} />
                Built for founders raising pre-seed to Series A
              </span>
            </span>
          </motion.div>

          <motion.h1 {...rise(0.08)} className="mt-6 text-[clamp(34px,4.3vw,54px)] leading-[1.03] tracking-[-0.045em] text-display">
            From your domain to your first investor email in{" "}
            <Mark type="underline" strokeWidth={2.6} padding={2} delay={1100} duration={900}>
              fifteen minutes.
            </Mark>
          </motion.h1>

          <motion.p {...rise(0.16)} className="mt-6 max-w-[520px] text-[17px] leading-relaxed text-muted">
            Centrale reads your website, writes your startup profile, scores every investor against your stage and sector, and
            sends from an inbox that is live the moment you sign up.
          </motion.p>

          <motion.div {...rise(0.24)} className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href="/signup" variant="primary" size="lg" square>
              Start your raise
            </ButtonLink>
            <ButtonLink href="#matching" variant="secondary" size="lg" square>
              See how matching works
            </ButtonLink>
          </motion.div>

          <motion.div {...rise(0.4)} className="relative mt-7 hidden items-start gap-1 pl-2 sm:flex">
            <ScribbleArrow className="h-9 w-20 -scale-y-100" delay={1.6} />
            <Hand className="mt-4 text-[22px]" tilt={-3}>
              no inbox warm-up, no spreadsheets
            </Hand>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2, ease }}
          className="relative mx-auto w-full max-w-[560px] self-center"
        >
          <FitFigure />
        </motion.div>
      </div>
    </section>
  );
}
