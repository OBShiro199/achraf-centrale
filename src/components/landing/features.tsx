"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/sketch/reveal";
import { ScribbleBurst } from "@/components/sketch/draw";
import { RoughStrokes, type Stroke } from "@/components/sketch/rough";
import { SectionHead } from "./section-head";

const ease = [0.22, 0.61, 0.21, 1] as const;

const SUMMARY =
  "Northwind makes compostable cold-chain packaging for grocery delivery. Boxes are moulded from agricultural waste and hold 4°C for 36 hours. Sold to regional grocers on a per-box contract. 14 paying customers, pilot with a national chain in Q1.";

function ProfilePanel() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: "-20%" });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    setN(0);
    const id = setInterval(() => setN((v) => (v >= SUMMARY.length + 40 ? 0 : v + 2)), 28);
    return () => clearInterval(id);
  }, [inView]);

  return (
    <div ref={ref} className="h-full px-5 py-5 md:px-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-line bg-panel-2 text-[12px] font-medium text-ink">N</span>
        <div className="leading-tight">
          <p className="text-[13.5px] font-medium text-ink">Northwind Packaging</p>
          <p className="text-[12px] text-label">northwind.example</p>
        </div>
        <span className="ml-auto rounded-[4px] bg-green-soft px-1.5 py-0.5 text-[11.5px] font-medium text-green">Seed</span>
      </div>
      <p className="mt-4 text-[13px] text-label">Summary</p>
      <p className="mt-1 text-[14px] leading-relaxed text-body">
        {SUMMARY.slice(0, n)}
        <span className="caret ml-px inline-block h-[15px] w-[1.5px] translate-y-[2px] bg-pencil" />
      </p>
    </div>
  );
}

const investorRows = [
  { name: "Louise Phillips", firm: "Leafline Climate Fund", fit: 86 },
  { name: "Hannah Lindqvist", firm: "Aster Impact Capital", fit: 73 },
  { name: "Sofia Marchetti", firm: "Fornace Ventures", fit: 52 },
  { name: "Steve Jones", firm: "Independent", fit: 41 },
];

function InvestorsPanel() {
  return (
    <div className="h-full px-5 py-5 md:px-6">
      <div className="flex flex-wrap gap-1.5">
        {["Seed", "Climate", "UK", "Leads rounds"].map((c) => (
          <span key={c} className="rounded-[5px] border border-[#dccfc2] bg-panel-2 px-2 py-0.5 text-[12px] text-ink">
            {c}
          </span>
        ))}
        <span className="rounded-[5px] border border-dashed border-[#dccfc2] px-2 py-0.5 text-[12px] text-label">+ filter</span>
      </div>
      <div className="mt-4 border-t border-line-2">
        {investorRows.map((r, i) => (
          <div key={r.name} className="grid grid-cols-[1fr_92px] items-center gap-3 border-b border-line-2 py-2.5">
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13.5px] text-ink">{r.name}</p>
              <p className="truncate text-[12px] text-label">{r.firm}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-3">
                <motion.div
                  className="h-full rounded-full bg-ink"
                  initial={{ width: 0 }}
                  whileInView={{ width: `${r.fit}%` }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.12, duration: 0.8, ease }}
                />
              </div>
              <span className="tabular w-6 text-right text-[12.5px] text-muted">{r.fit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InboxPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20%" });
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setArrived(true), 1400);
    const r = setTimeout(() => setArrived(false), 7000);
    const loop = setInterval(() => {
      setArrived(false);
      setTimeout(() => setArrived(true), 1400);
    }, 8000);
    return () => {
      clearTimeout(t);
      clearTimeout(r);
      clearInterval(loop);
    };
  }, [inView]);

  const base = [
    { who: "Daniel Kim", subject: "Northwind seed round, 20 minutes?", when: "2h", state: "Opened" },
    { who: "Priya Raman", subject: "Compostable cold chain", when: "5h", state: "Sent" },
  ];

  return (
    <div ref={ref} className="h-full px-5 py-5 md:px-6">
      <div className="flex items-center gap-2 text-[12.5px] text-label">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-green" />
        maya@omail.sh
        <span className="ml-auto">ready at signup</span>
      </div>
      <div className="relative mt-4 border-t border-line-2">
        <AnimatePresence initial={false}>
          {arrived && (
            <motion.div
              key="reply"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.5, ease }}
              className="relative overflow-hidden"
            >
              <div className="flex items-center gap-3 border-b border-line-2 bg-pencil-soft/40 py-2.5 pl-2 pr-1">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pencil" />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[13.5px] font-medium text-ink">Louise Phillips replied</p>
                  <p className="truncate text-[12px] text-muted">Happy to talk. Does Thursday at 10 work?</p>
                </div>
                <span className="text-[12px] text-label">now</span>
              </div>
              <ScribbleBurst className="absolute right-10 top-0 h-5 w-9" immediate />
            </motion.div>
          )}
        </AnimatePresence>
        {base.map((m) => (
          <div key={m.who} className="flex items-center gap-3 border-b border-line-2 py-2.5 pl-2 pr-1">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-transparent" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13.5px] text-ink">{m.who}</p>
              <p className="truncate text-[12px] text-label">{m.subject}</p>
            </div>
            <span className="text-[12px] text-label">{m.state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const week = [
  { d: "M", sent: 12, replies: 1 },
  { d: "T", sent: 18, replies: 2 },
  { d: "W", sent: 20, replies: 3 },
  { d: "T", sent: 20, replies: 2 },
  { d: "F", sent: 16, replies: 4 },
];

function NumbersPanel() {
  return (
    <div className="flex h-full flex-col px-5 py-5 md:px-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Sent", "86"],
          ["Open rate", "61%"],
          ["Replies", "12"],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-[12px] text-label">{k}</p>
            <p className="tabular text-[22px] tracking-[-0.04em] text-display">{v}</p>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 300 110" className="mt-3 w-full flex-1">
        <RoughStrokes
          build={(g) => {
            const s: Stroke[] = [{ drawable: g.line(8, 96, 292, 96, { seed: 2, roughness: 0.8, stroke: "#9a8d88", strokeWidth: 1 }), duration: 0.5 }];
            week.forEach((w, i) => {
              const x = 22 + i * 56;
              const h = w.sent * 4;
              s.push({
                drawable: g.rectangle(x, 96 - h, 22, h, { seed: 10 + i, roughness: 1, stroke: "#6f5f62", strokeWidth: 1, fill: "#9a8d88", fillStyle: "hachure", hachureGap: 4, fillWeight: 0.7 }),
                delay: 0.2 + i * 0.12,
                duration: 0.7,
              });
              const rh = w.replies * 9;
              s.push({
                drawable: g.rectangle(x + 25, 96 - rh, 12, rh, { seed: 30 + i, roughness: 1, stroke: "#d94a38", strokeWidth: 1.1, fill: "#d94a38", fillStyle: "cross-hatch", hachureGap: 3.5, fillWeight: 0.6 }),
                delay: 0.5 + i * 0.12,
                duration: 0.6,
              });
            });
            return s;
          }}
        />
        {week.map((w, i) => (
          <text key={i} x={22 + i * 56 + 18} y={108} fontSize={10} textAnchor="middle" fill="#9a8d88">
            {w.d}
          </text>
        ))}
      </svg>
    </div>
  );
}

const panels = [
  { title: "A profile written from your site", pitch: "We read your homepage and Claude writes the summary investors see.", Panel: ProfilePanel },
  { title: "Investors you can filter", pitch: "Stage, sector, cheque size, geography and values, each with a fit score.", Panel: InvestorsPanel },
  { title: "An inbox that exists at signup", pitch: "Sending starts in minutes. Replies land in one place and you get an email.", Panel: InboxPanel },
  { title: "The numbers that matter", pitch: "Emails sent, open rate from pixel tracking, and who replied.", Panel: NumbersPanel },
];

export function Features() {
  return (
    <section className="border-b border-line">
      <div className="rail">
        <div className="px-4 pb-14 pt-20 md:px-8 lg:pt-24">
          <SectionHead num="4" label="What you get" title="Everything a first raise needs, in one workspace." />
        </div>
        <div className="grid border-t border-line md:grid-cols-2">
          {panels.map(({ title, pitch, Panel }, i) => (
            <Reveal
              key={title}
              delay={(i % 2) * 0.1}
              className="border-b border-line md:[&:nth-child(odd)]:border-r md:[&:nth-last-child(-n+2)]:border-b-0"
            >
              <div className="px-4 pb-6 pt-8 md:px-8">
                <h3 className="text-[18px] tracking-[-0.03em]">{title}</h3>
                <p className="mt-1.5 text-[14.5px] text-muted">{pitch}</p>
              </div>
              <div className="h-[258px] border-t border-line-2 bg-panel">
                <Panel />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
