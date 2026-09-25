import type { ReactNode } from "react";
import { Reveal } from "@/components/sketch/reveal";
import { cn } from "@/lib/utils";

export function SectionHead({
  num,
  label,
  title,
  lead,
  center,
  className,
}: {
  num: string;
  label: string;
  title: ReactNode;
  lead?: ReactNode;
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(center ? "mx-auto max-w-[760px] text-center" : "max-w-[640px]", className)}>
      <Reveal>
        <p className="eyebrow">
          <b>§ {num}</b>
          {label}
        </p>
      </Reveal>
      <Reveal delay={0.08}>
        <h2 className="mt-4 text-[clamp(26px,3vw,38px)] leading-[1.08] tracking-[-0.04em]">{title}</h2>
      </Reveal>
      {lead && (
        <Reveal delay={0.16}>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">{lead}</p>
        </Reveal>
      )}
    </div>
  );
}
