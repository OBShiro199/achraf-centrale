"use client";

import { AnimatePresence, motion } from "motion/react";
import { ScribbleTick } from "@/components/sketch/draw";
import { HEADCOUNT, INVESTOR_TYPES, label, REVENUE, STAGES, VALUES } from "@/lib/taxonomy";

export interface Draft {
  firstName: string;
  lastName: string;
  domain: string;
  siteName: string | null;
  siteDescription: string | null;
  favicon: string | null;
  scraping: boolean;
  headcount: string | null;
  values: string[];
  valuesDone: boolean;
  stage: string | null;
  investorTypes: string[];
  revenue: string | null;
  deckName: string | null;
  wantsDeck: boolean;
}

function Row({ k, v, done }: { k: string; v: React.ReactNode; done: boolean }) {
  return (
    <div className="grid grid-cols-[88px_1fr_20px] items-baseline gap-3 border-b border-[#e9e2d6]/70 py-2.5">
      <span className="text-[12.5px] text-label">{k}</span>
      <span className="min-h-[24px]">
        <AnimatePresence mode="wait">
          {done ? (
            <motion.span
              key="v"
              initial={{ opacity: 0, clipPath: "inset(0 100% 0 0)" }}
              animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
              transition={{ duration: 0.7, ease: [0.22, 0.61, 0.21, 1] }}
              className="hand block text-[21px] leading-[1.1] text-ink"
            >
              {v}
            </motion.span>
          ) : (
            <motion.span key="e" className="block h-[20px] border-b border-dotted border-faint" />
          )}
        </AnimatePresence>
      </span>
      <span>{done && <ScribbleTick className="h-4 w-4" immediate delay={0.5} />}</span>
    </div>
  );
}

export function Worksheet({ draft }: { draft: Draft }) {
  const name = [draft.firstName, draft.lastName].filter(Boolean).join(" ");
  const raising = draft.stage
    ? [label(STAGES, draft.stage), draft.investorTypes.map((t) => label(INVESTOR_TYPES, t)).join(", ")].filter(Boolean).join(", from ")
    : "";

  return (
    <div className="relative mx-auto w-full max-w-[440px] rotate-[0.6deg]">
      <div className="absolute -top-3 left-1/2 z-10 h-6 w-24 -translate-x-1/2 -rotate-2 bg-[#ecebe4]/90 shadow-sm" aria-hidden />
      <div className="margin-rule rounded-[4px] border border-[#e7e3da] bg-[#fffdf8] py-6 pl-16 pr-6 shadow-[0_1px_0_rgba(57,28,37,0.04),0_30px_60px_-40px_rgba(57,28,37,0.35)]">
        <div className="flex items-baseline justify-between">
          <p className="text-[15px] font-medium tracking-[-0.02em] text-ink">Startup profile</p>
          <p className="hand text-[18px] text-pencil">draft</p>
        </div>
        <p className="mt-0.5 text-[12px] text-label">Filled in as you answer.</p>

        <div className="mt-4">
          <Row k="Founder" v={name} done={Boolean(draft.firstName)} />
          <Row
            k="Company"
            done={Boolean(draft.domain)}
            v={
              <span className="flex items-center gap-2">
                {draft.favicon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.favicon} alt="" className="h-4 w-4 rounded-[3px]" />
                )}
                {draft.siteName ?? draft.domain}
              </span>
            }
          />
          <AnimatePresence>
            {(draft.scraping || draft.siteDescription) && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                <p className="border-b border-[#e9e2d6]/70 py-2.5 pl-[100px] text-[13px] leading-snug text-muted">
                  {draft.scraping ? <span className="text-label">Reading {draft.domain}…</span> : draft.siteDescription}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <Row k="Team" v={label(HEADCOUNT, draft.headcount)} done={Boolean(draft.headcount)} />
          <Row
            k="Values"
            v={draft.values.length ? draft.values.map((v) => label(VALUES, v)).join(", ") : "none in particular"}
            done={draft.valuesDone}
          />
          <Row k="Raising" v={raising} done={Boolean(draft.stage)} />
          <Row k="Revenue" v={label(REVENUE, draft.revenue)} done={Boolean(draft.revenue)} />
          <Row k="Deck" v={draft.deckName ?? "please draft one"} done={Boolean(draft.deckName) || draft.wantsDeck} />
        </div>
      </div>
    </div>
  );
}
