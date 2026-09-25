import { BrandMark } from "./logo";

const rowA = ["Pre-seed", "Seed", "Angel round", "Series A", "First raise", "Second raise"];
const rowB = ["Climate", "Fintech", "Hardware", "AI", "Health", "Consumer", "Logistics", "Education"];

function Row({ words, sep, reverse }: { words: string[]; sep: string; reverse?: boolean }) {
  const items = [...words, ...words];
  return (
    <div className="marquee-mask overflow-hidden">
      <div className={`marquee-track flex w-max items-center ${reverse ? "reverse" : ""}`}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
            {items.map((w, i) => (
              <span key={`${copy}-${i}`} className="flex items-center">
                <span
                  className={`display whitespace-nowrap px-6 text-[clamp(40px,6vw,84px)] leading-[1.1] tracking-[-0.05em] ${i % 2 ? "text-[#d5c8ba]" : "text-display"}`}
                >
                  {w}
                </span>
                <BrandMark className="h-[clamp(20px,2.6vw,34px)] w-[clamp(20px,2.6vw,34px)]" color={sep === "alt" ? "var(--color-burgundy)" : "var(--color-vermilion)"} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Marquee() {
  return (
    <section className="overflow-hidden border-b border-line py-12" aria-label="Stages and sectors we match">
      <Row words={rowA} sep="main" />
      <div className="h-2" />
      <Row words={rowB} sep="alt" reverse />
    </section>
  );
}
