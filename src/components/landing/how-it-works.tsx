import { Reveal } from "@/components/sketch/reveal";
import { ScribbleArrow } from "@/components/sketch/draw";
import { SectionHead } from "./section-head";

const steps = [
  {
    n: "01",
    title: "Enter your domain",
    body: "We read your homepage and pull out what you sell, who buys it and what you have shipped.",
    time: "30 seconds",
  },
  {
    n: "02",
    title: "Answer five questions",
    body: "Team size, values, stage, revenue, and your deck if you have one. We build the profile while you answer.",
    time: "2 minutes",
  },
  {
    n: "03",
    title: "Get matched",
    body: "Investors outside your stage or geography drop out, then the rest are scored on sector, stage and thesis.",
    time: "instant",
  },
  {
    n: "04",
    title: "Send from your own inbox",
    body: "Your sending inbox exists from signup. Claude drafts each first email, you read it, and it goes.",
    time: "under 15 minutes",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16 border-b border-line">
      <div className="rail px-4 py-20 md:px-8 lg:py-24">
        <SectionHead
          num="2"
          label="How it works"
          title="Four steps, shown working."
          lead="The whole path from signup to the first investor email, timed."
        />
        <div className="mt-14 grid border-t border-line md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <Reveal
              key={s.n}
              delay={i * 0.1}
              className="relative flex flex-col border-b border-line py-8 md:px-6 md:first:pl-0 md:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r lg:last:border-r-0"
            >
              <span className="tabular text-[13px] text-faint">{s.n}</span>
              <h3 className="mt-6 text-[19px] tracking-[-0.03em]">{s.title}</h3>
              <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
              <p className="hand mt-auto pt-6 text-[21px] text-pencil">{s.time}</p>
              {i < steps.length - 1 && (
                <ScribbleArrow className="absolute -right-7 top-12 z-10 hidden h-7 w-14 lg:block" delay={0.6 + i * 0.3} />
              )}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
