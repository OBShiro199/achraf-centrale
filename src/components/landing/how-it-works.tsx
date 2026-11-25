import { Reveal } from "@/components/sketch/reveal";
import { ScribbleArrow } from "@/components/sketch/draw";
import { SectionHead } from "./section-head";

const steps = [
  {
    n: "01",
    title: "Tell us about your raise",
    body: "Your website, your round and a few answers. Claude writes your startup profile while you type.",
    time: "2 minutes",
  },
  {
    n: "02",
    title: "Meet your first ten",
    body: "Investors who back your exact round, one per firm, ranked by fit and each with a reason.",
    time: "instant",
  },
  {
    n: "03",
    title: "Reach them everywhere",
    body: "Email from your own domain, LinkedIn and WhatsApp from your own accounts, calls from your US number. Claude drafts, you approve.",
    time: "day one",
  },
  {
    n: "04",
    title: "Work one inbox",
    body: "Every reply and every recorded call lands in one place, tagged interested, meeting or not now. Your pipeline moves itself.",
    time: "every day",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16 border-b border-line">
      <div className="rail px-4 py-20 md:px-8 lg:py-24">
        <SectionHead
          num="2"
          label="How it works"
          title="Four steps from signup to your first meetings."
          lead="Everything is switched on in the trial, so you have momentum before your first payment."
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
