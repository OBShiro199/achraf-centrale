"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Reveal } from "@/components/sketch/reveal";
import { SectionHead } from "./section-head";

const faqs = [
  {
    q: "What is included in the trial?",
    a: "Everything. Your investor matches, a sending domain we buy for you, your inbox, a US phone number, LinkedIn and WhatsApp from your own accounts, full contact details, exports and a researched pitch deck. A card is needed to start, and nothing is charged if you cancel within 7 days.",
  },
  {
    q: "Which plan should I pick?",
    a: "$129 a month, or $249 every three months. Most raises take three to six months, so the quarterly plan covers a raise for about $83 a month. Cancel either from Billing at any time.",
  },
  {
    q: "Will my emails land in spam?",
    a: "We set you up on your own company domain with the authentication mailbox providers check for, start each new inbox at 20 new emails a day and ramp from there. Bounced addresses are blocked straight away, so one bad address never hurts the next email.",
  },
  {
    q: "Is it safe to message from my LinkedIn and WhatsApp?",
    a: "Messages go from your own accounts, with daily limits well inside what LinkedIn and WhatsApp tolerate: 20 LinkedIn invites and 15 new WhatsApp chats a day. Nothing sends without you reading it first.",
  },
  {
    q: "Are calls recorded?",
    a: "Yes. The investor hears a short notice that the call may be recorded. Each call is transcribed and summarised, and Claude tags the outcome so you can see who to follow up. Only you can listen to your recordings.",
  },
  {
    q: "Where does the investor data come from?",
    a: "A directory of about 134,000 active investors, partners and angels with their stage, sectors, location and a work email, plus a phone number or LinkedIn profile where we have one. Investors can remove themselves at any time.",
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
