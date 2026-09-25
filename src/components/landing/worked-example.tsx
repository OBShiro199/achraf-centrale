"use client";

import { motion } from "motion/react";
import { Reveal } from "@/components/sketch/reveal";
import { ScribbleCircle, ScribbleStrike, ScribbleTick } from "@/components/sketch/draw";
import { Hand } from "@/components/sketch/hand";
import { SectionHead } from "./section-head";

const candidates = [
  { name: "Leafline Climate Fund", note: "Seed, Series A. UK.", out: false },
  { name: "Aster Impact Capital", note: "Seed, Series A. Nordics and UK.", out: false },
  { name: "Keel Street Capital", note: "Pre-seed to A. US only.", out: true },
  { name: "Fornace Corporate Ventures", note: "Series A and later.", out: false },
  { name: "Pilot Light Accelerator", note: "Pre-seed only.", out: true },
];

const scored = [
  { name: "Leafline Climate Fund", sector: 30, stage: 20, thesis: 0.92, total: 86 },
  { name: "Aster Impact Capital", sector: 30, stage: 20, thesis: 0.61, total: 73 },
  { name: "Fornace Corporate Ventures", sector: 30, stage: 0, thesis: 0.74, total: 52 },
];

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 border-t border-line py-7 md:grid-cols-[170px_1fr] md:gap-8 [&>*]:min-w-0">
      <div>
        <p className="text-[12.5px] text-label">Step {n}</p>
        <p className="mt-1 text-[16px] font-medium tracking-[-0.02em] text-ink">{title}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function WorkedExample() {
  return (
    <section id="matching" className="scroll-mt-16 border-b border-line">
      <div className="rail grid gap-12 px-4 py-20 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-24 [&>*]:min-w-0">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SectionHead
            num="3"
            label="Matching"
            title="Three passes, from the whole list to a shortlist."
            lead="Hard filters remove the impossible. A weighted score ranks the rest. Claude reads the top fifty and flags conflicts a formula cannot see."
          />
          <Reveal delay={0.25} className="mt-8 hidden lg:block">
            <Hand className="text-[22px]" tilt={-2}>
              sector 30 pts, stage 20 pts,
              <br />
              thesis by similarity
            </Hand>
          </Reveal>
        </div>

        <Reveal className="relative rounded-[10px] border border-line bg-panel shadow-[0_1px_0_rgba(57,28,37,0.03),0_18px_40px_-28px_rgba(57,28,37,0.18)]">
          <div className="margin-rule graph-paper-faint rounded-[10px] px-5 pb-4 pt-6 md:pl-16 md:pr-8">
            <p className="text-[12.5px] text-label">Worked example 3.1</p>
            <p className="mt-2 max-w-[520px] text-[17px] leading-snug tracking-[-0.02em] text-ink">
              A seed-stage climate hardware company in Edinburgh, twelve months from revenue, raising £1.5m.
            </p>

            <div className="mt-6">
              <Step n="1" title="Hard filters">
                <p className="mb-3 text-[14px] text-muted">Remove investors who do not write seed cheques or do not invest in the UK.</p>
                <ul className="space-y-2">
                  {candidates.map((c, i) => (
                    <li key={c.name} className="relative flex items-baseline justify-between gap-4 text-[14.5px]">
                      <span className={c.out ? "text-faint" : "text-ink"}>{c.name}</span>
                      <span className={c.out ? "text-faint" : "text-label"}>{c.note}</span>
                      {c.out && <ScribbleStrike className="absolute left-0 top-1/2 h-3 w-full -translate-y-1/2" delay={0.4 + i * 0.15} />}
                    </li>
                  ))}
                </ul>
              </Step>

              <Step n="2" title="Weighted score">
                <div className="overflow-x-auto md:overflow-visible">
                  <table className="w-full min-w-[420px] border-collapse text-[14px] md:min-w-0">
                    <thead>
                      <tr className="text-left text-[12.5px] text-label">
                        <th className="py-2 pr-3 font-normal">Investor</th>
                        <th className="px-3 py-2 text-right font-normal">Sector</th>
                        <th className="px-3 py-2 text-right font-normal">Stage</th>
                        <th className="px-3 py-2 text-right font-normal">Thesis</th>
                        <th className="py-2 pl-3 text-right font-normal">Fit</th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {scored.map((r, i) => (
                        <tr key={r.name} className="border-t border-line-2">
                          <td className="py-2.5 pr-3 text-ink">{r.name}</td>
                          <td className="px-3 py-2.5 text-right text-muted">{r.sector}</td>
                          <td className="px-3 py-2.5 text-right text-muted">{r.stage}</td>
                          <td className="px-3 py-2.5 text-right text-muted">{r.thesis.toFixed(2)}</td>
                          <td className="relative py-2.5 pl-3 text-right font-medium text-ink">
                            {r.total}
                            {i === 0 && <ScribbleCircle className="absolute -right-4 top-1/2 h-9 w-14 -translate-y-1/2" delay={0.8} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Step>

              <Step n="3" title="Review">
                <p className="text-[14px] text-muted">Claude reads each shortlisted investor&apos;s portfolio against your profile.</p>
                <div className="mt-3 flex items-start gap-3 rounded-[6px] border border-[#f0cfc6] bg-pencil-soft/60 px-3 py-2.5 text-[14px] text-body">
                  <span className="mt-0.5 font-medium text-pencil">Flag</span>
                  <span>Fornace backed Coldchain One, a direct competitor. Moved to the bottom of the list.</span>
                </div>
              </Step>

              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
                <span className="hand text-[28px] leading-none text-ink">∴</span>
                <p className="text-[16px] tracking-[-0.02em] text-ink">Start with Leafline, then Aster.</p>
                <motion.span
                  className="ml-auto inline-block h-3.5 w-3.5 bg-ink"
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 1.2, type: "spring", stiffness: 300, damping: 18 }}
                  aria-label="End of proof"
                />
                <ScribbleTick className="h-5 w-5" delay={1.1} />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
