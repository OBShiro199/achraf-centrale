import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/sketch/reveal";
import { ScribbleTick } from "@/components/sketch/draw";
import { Hand } from "@/components/sketch/hand";
import { SectionHead } from "./section-head";
import { BrandMark } from "./logo";

const included = [
  "Startup profile written from your website and deck",
  "Investor matching on stage, sector, values and thesis",
  "A sending inbox created the moment you sign up",
  "A Claude draft for every first email",
  "Follow-ups after three days without a reply",
  "Replies in one inbox, plus an email when an investor answers",
  "Phone numbers for WhatsApp on higher tiers",
];

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-16 border-b border-line">
      <div className="rail px-4 py-20 md:px-8 lg:py-24">
        <SectionHead num="5" label="Pricing" title="One plan to start. Pay more only for volume." center />
        <Reveal delay={0.15} className="mx-auto mt-12 max-w-[920px]">
          <div className="grid overflow-hidden rounded-[12px] border border-line bg-panel shadow-[0_1px_0_rgba(57,28,37,0.03),0_24px_50px_-36px_rgba(57,28,37,0.25)] md:grid-cols-[0.9fr_1.1fr]">
            <div className="graph-paper-faint flex flex-col border-b border-line p-7 md:border-b-0 md:border-r md:p-9">
              <p className="flex items-center gap-2 text-[14px] text-muted">
                <BrandMark className="h-4 w-4" assemble onView delay={0.3} />
                Managed outreach
              </p>
              <p className="mt-4 flex items-baseline gap-1.5">
                <span className="display tabular text-[60px] leading-none tracking-[-0.06em] text-display">$49</span>
                <span className="text-[15px] text-muted">a month</span>
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                Up to $199 a month for mobile numbers and higher daily volume.
              </p>
              <ButtonLink href="/signup" variant="primary" size="lg" square className="mt-8 w-full">
                Start your raise
              </ButtonLink>
              <div className="mt-auto pt-8">
                <Hand className="text-[21px]" tilt={-2}>
                  or buy the full investor list once, $499
                </Hand>
              </div>
            </div>
            <ul className="divide-y divide-line-2 p-7 md:p-9">
              {included.map((item, i) => (
                <li key={item} className="flex items-start gap-3 py-3 text-[14.5px] text-body first:pt-0 last:pb-0">
                  <ScribbleTick className="mt-0.5 h-[18px] w-[18px] shrink-0" delay={0.3 + i * 0.08} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
