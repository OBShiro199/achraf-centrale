"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Reveal } from "@/components/sketch/reveal";
import { SectionHead } from "./section-head";

const faqs = [
  {
    q: "How can emails go out in minutes if new inboxes need warming up?",
    a: "Every founder gets a sending inbox at signup on domains that are already warm, so the first emails leave straight away. Daily volume ramps up over the first month, and you can connect your own domain later.",
  },
  {
    q: "Where does the investor data come from?",
    a: "A maintained list of active investors with stage, sector, cheque size, geography and portfolio. Each investor is matched against your profile, not a keyword search.",
  },
  {
    q: "What if I do not have a pitch deck?",
    a: "Tell us during onboarding. We draft one from your website and your answers, and you edit it before anyone sees it. If you do have one, upload it as PDF, PPTX, PPT, KEY or DOCX.",
  },
  {
    q: "Do I write the emails myself?",
    a: "Claude drafts each first email from your profile and that investor's thesis and portfolio. You read, edit and approve every one before it sends.",
  },
  {
    q: "Can I send from my own Gmail?",
    a: "Yes, for your first week you can route through your own address while the dedicated inboxes build their sending history.",
  },
  {
    q: "How do I know when an investor replies?",
    a: "Replies land in your Centrale inbox with the investor attached, and we send you an email the moment one arrives.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-16 border-b border-line">
      <div className="rail grid gap-10 px-4 py-20 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-24 [&>*]:min-w-0">
        <SectionHead num="6" label="Questions" title="Answers, with the working shown." />
        <Reveal delay={0.1} className="border-t border-line">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className="border-b border-line">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-start justify-between gap-6 py-5 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-[16.5px] font-medium tracking-[-0.02em] text-ink">{f.q}</span>
                  <span className="hand w-5 shrink-0 text-center text-[26px] leading-[0.9] text-graphite">{isOpen ? "–" : "+"}</span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.4, ease: [0.22, 0.61, 0.21, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-[600px] pb-6 text-[15px] leading-relaxed text-muted">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
