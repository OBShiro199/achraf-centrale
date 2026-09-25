"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Logo } from "@/components/landing/logo";
import { Hand } from "@/components/sketch/hand";
import { Convergence } from "@/components/sketch/convergence";
import { TAGLINE } from "@/lib/utils";

const ease = [0.22, 0.61, 0.21, 1] as const;

export function AuthShell({ title, lead, children, footer }: { title: string; lead: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col px-5 py-6 md:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-12">
          <motion.div initial={{ opacity: 0, y: 16, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, ease }}>
            <h1 className="text-[32px] leading-tight tracking-[-0.04em]">{title}</h1>
            <p className="mt-2 text-[15px] text-muted">{lead}</p>
            <div className="mt-8">{children}</div>
            <div className="mt-6 text-[14px] text-muted">{footer}</div>
          </motion.div>
        </div>
        <p className="text-[12.5px] text-faint">By continuing you agree to be emailed about your raise. Nothing else.</p>
      </div>

      <div className="graph-paper relative hidden overflow-hidden border-l border-line lg:block">
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="relative w-full max-w-[460px]">
            <p className="text-[12.5px] text-label">Exercise 1.1</p>
            <p className="display mt-2 text-[26px] leading-[1.15] tracking-[-0.035em] text-ink">
              Your next round <span className="text-vermilion">starts here.</span>
            </p>
            <p className="mt-2 text-[15px] text-muted">{TAGLINE}</p>
            <Convergence className="mt-10 w-full overflow-visible" immediate />
            <div className="absolute -bottom-10 left-2">
              <Hand className="text-[21px]" tilt={-3}>
                every investor, one inbox
              </Hand>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
