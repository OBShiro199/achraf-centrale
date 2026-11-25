import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/sketch/reveal";
import { ScribbleTick } from "@/components/sketch/draw";
import { Hand } from "@/components/sketch/hand";
import { SectionHead } from "./section-head";
import { BrandMark } from "./logo";

const included = [
  "Investor matching at your exact round, with a reason for each",
  "Your own sending domain, bought and set up for you",
  "Email, LinkedIn and WhatsApp from your own accounts",
  "A US phone number with recorded, transcribed calls",
  "One inbox for every reply, tagged by Claude",
  "Claude drafts for every channel, plus automatic follow-ups",
  "Full contact details, exports and a researched pitch deck",
];

const plans = [
  { name: "Monthly", price: "$129", per: "a month", note: "Cancel any time", featured: false },
  { name: "Quarterly", price: "$249", per: "every 3 months", note: "About $83 a month. Covers a typical raise.", featured: true },
];

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-16 border-b border-line">
      <div className="rail px-4 py-20 md:px-8 lg:py-24">
        <SectionHead num="5" label="Pricing" title="Everything included. Pay by the month or by the raise." center />
        <Reveal delay={0.15} className="mx-auto mt-12 max-w-[960px]">
          <div className="grid overflow-hidden rounded-[12px] border border-line bg-panel shadow-[0_1px_0_rgba(57,28,37,0.03),0_24px_50px_-36px_rgba(57,28,37,0.25)] md:grid-cols-[1.1fr_0.9fr]">
            <div className="graph-paper-faint flex flex-col border-b border-line p-7 md:border-b-0 md:border-r md:p-9">
              <p className="flex items-center gap-2 text-[14px] text-muted">
                <BrandMark className="h-4 w-4" assemble onView delay={0.3} />7 days free, card required
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {plans.map((p) => (
                  <div key={p.name} className={p.featured ? "relative rounded-[10px] border border-ink bg-panel p-5 ring-1 ring-ink" : "rounded-[10px] border border-line bg-panel p-5"}>
                    {p.featured && (
                      <span className="absolute -top-2.5 right-4 rounded-full bg-vermilion px-2 py-0.5 text-[11px] font-medium text-ivory">Save 36%</span>
                    )}
                    <p className="text-[13px] text-muted">{p.name}</p>
                    <p className="mt-2 flex items-baseline gap-1.5">
                      <span className="display tabular text-[44px] leading-none tracking-[-0.06em] text-display">{p.price}</span>
                      <span className="text-[13px] text-muted">{p.per}</span>
                    </p>
                    <p className="mt-2 text-[12.5px] leading-snug text-label">{p.note}</p>
                  </div>
                ))}
              </div>
              <ButtonLink href="/signup" variant="primary" size="lg" square className="mt-8 w-full">
                Start your 7-day trial
              </ButtonLink>
              <div className="mt-auto pt-8">
                <Hand className="text-[21px]" tilt={-2}>
                  no yearly lock-in, raises do not take a year
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
