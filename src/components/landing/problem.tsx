import { Reveal } from "@/components/sketch/reveal";
import { Mark } from "@/components/sketch/mark";
import { SectionHead } from "./section-head";

const rows = [
  {
    term: "Given",
    body: "A domain, a stage, a raise amount, and a deck if you have one.",
  },
  {
    term: "Find",
    body: (
      <>
        The{" "}
        <Mark type="circle" color="#d94a38" padding={[2, 8]} strokeWidth={1.8} iterations={1} delay={300}>
          fifty investors
        </Mark>{" "}
        most likely to reply, and a first email to each of them.
      </>
    ),
  },
  {
    term: "Constraint",
    body: "The first email leaves today, not after two weeks of inbox warm-up.",
  },
];

export function Problem() {
  return (
    <section className="border-b border-line">
      <div className="rail grid gap-10 px-4 py-20 md:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:py-24 [&>*]:min-w-0">
        <SectionHead
          num="1"
          label="The problem"
          title="Raising is a search problem. Most founders solve it by hand."
          lead="Spreadsheets of funds, guessed email addresses, cold domains that land in spam. Centrale treats it like an exercise with a known method."
        />
        <div className="border-t border-line">
          {rows.map((r, i) => (
            <Reveal key={r.term} delay={0.1 + i * 0.1}>
              <div className="grid grid-cols-[112px_1fr] gap-6 border-b border-line py-6 md:grid-cols-[140px_1fr]">
                <span className="hand pt-0.5 text-[26px] leading-none text-graphite">{r.term}.</span>
                <p className="text-[18px] leading-snug tracking-[-0.02em] text-ink md:text-[20px]">{r.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
