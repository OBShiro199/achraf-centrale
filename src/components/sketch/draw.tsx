"use client";

import { motion, type Transition } from "motion/react";
import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

const settle = [0.22, 0.61, 0.21, 1] as const;

type DrawProps = {
  d: string;
  delay?: number;
  duration?: number;
  color?: string;
  width?: number;
  /** Animate on mount instead of when scrolled into view. */
  immediate?: boolean;
  fill?: string;
  className?: string;
  dash?: string;
};

/** A path that draws itself like a pencil stroke. Use inside an <svg>. */
export function Draw({ d, delay = 0, duration = 0.9, color = "currentColor", width = 2, immediate, fill = "none", className, dash }: DrawProps) {
  const transition: Transition = { pathLength: { duration, delay, ease: settle }, opacity: { duration: 0.01, delay } };
  const target = { pathLength: 1, opacity: 1 };
  return (
    <motion.path
      d={d}
      fill={fill}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dash}
      className={className}
      initial={{ pathLength: 0, opacity: 0 }}
      {...(immediate ? { animate: target } : { whileInView: target, viewport: { once: true, margin: "0px 0px -8% 0px" } })}
      transition={transition}
    />
  );
}

type ScribbleProps = Omit<SVGProps<SVGSVGElement>, "color"> & {
  delay?: number;
  duration?: number;
  color?: string;
  width?: number;
  immediate?: boolean;
};

function Svg({ viewBox, className, children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox={viewBox} fill="none" aria-hidden className={cn("overflow-visible", className)} {...rest}>
      <g filter="url(#graphite)">{children}</g>
    </svg>
  );
}

export function ScribbleUnderline({ delay, duration = 0.7, color = "var(--color-pencil)", width = 2.4, immediate, className, ...rest }: ScribbleProps) {
  return (
    <Svg viewBox="0 0 260 16" preserveAspectRatio="none" className={className} {...rest}>
      <Draw d="M3 10 C 48 4, 104 3, 150 6 S 222 11, 257 5" delay={delay} duration={duration} color={color} width={width} immediate={immediate} />
      <Draw d="M22 13 C 80 9, 150 9, 236 10" delay={(delay ?? 0) + duration * 0.8} duration={duration * 0.7} color={color} width={width * 0.7} immediate={immediate} />
    </Svg>
  );
}

export function ScribbleCircle({ delay, duration = 1.1, color = "var(--color-pencil)", width = 2.2, immediate, className, ...rest }: ScribbleProps) {
  return (
    <Svg viewBox="0 0 260 90" preserveAspectRatio="none" className={className} {...rest}>
      <Draw
        d="M58 14 C 120 2, 222 6, 246 34 C 266 60, 196 84, 122 84 C 48 84, 6 70, 10 46 C 14 22, 70 10, 132 8 C 170 7, 196 10, 214 16"
        delay={delay}
        duration={duration}
        color={color}
        width={width}
        immediate={immediate}
      />
    </Svg>
  );
}

export function ScribbleArrow({ delay, duration = 0.8, color = "var(--color-graphite)", width = 1.8, immediate, className, flip, ...rest }: ScribbleProps & { flip?: boolean }) {
  return (
    <Svg viewBox="0 0 140 60" className={cn(flip && "-scale-x-100", className)} {...rest}>
      <Draw d="M6 52 C 30 20, 74 6, 124 16" delay={delay} duration={duration} color={color} width={width} immediate={immediate} />
      <Draw d="M110 6 L 126 16 L 112 28" delay={(delay ?? 0) + duration * 0.85} duration={0.3} color={color} width={width} immediate={immediate} />
    </Svg>
  );
}

export function ScribbleTick({ delay, duration = 0.45, color = "var(--color-green)", width = 2.4, immediate, className, ...rest }: ScribbleProps) {
  return (
    <Svg viewBox="0 0 24 24" className={className} {...rest}>
      <Draw d="M3.5 13 C 6 15, 8 17.5, 9.5 19.5 C 12.5 13, 16 7.5, 21 3.5" delay={delay} duration={duration} color={color} width={width} immediate={immediate} />
    </Svg>
  );
}

export function ScribbleCross({ delay, duration = 0.35, color = "var(--color-pencil)", width = 2, immediate, className, ...rest }: ScribbleProps) {
  return (
    <Svg viewBox="0 0 24 24" className={className} {...rest}>
      <Draw d="M4 5 C 9 10, 14 15, 20 20" delay={delay} duration={duration} color={color} width={width} immediate={immediate} />
      <Draw d="M19.5 4.5 C 14 10, 9 15, 4.5 19.5" delay={(delay ?? 0) + duration} duration={duration} color={color} width={width} immediate={immediate} />
    </Svg>
  );
}

/** A loose strike-through for crossing out a line of text. */
export function ScribbleStrike({ delay, duration = 0.5, color = "var(--color-pencil)", width = 2, immediate, className, ...rest }: ScribbleProps) {
  return (
    <Svg viewBox="0 0 200 12" preserveAspectRatio="none" className={className} {...rest}>
      <Draw d="M2 7 C 50 4, 120 8, 198 5" delay={delay} duration={duration} color={color} width={width} immediate={immediate} />
    </Svg>
  );
}

/** Little bursts of pencil lines, for replies and good news. */
export function ScribbleBurst({ delay = 0, color = "var(--color-pencil)", width = 1.8, immediate, className, ...rest }: ScribbleProps) {
  const rays = ["M20 4 L 20 10", "M32 8 L 28 13", "M36 20 L 30 20", "M8 8 L 12 13", "M4 20 L 10 20"];
  return (
    <Svg viewBox="0 0 40 24" className={className} {...rest}>
      {rays.map((d, i) => (
        <Draw key={d} d={d} delay={delay + i * 0.06} duration={0.25} color={color} width={width} immediate={immediate} />
      ))}
    </Svg>
  );
}

export function ScribbleBox({ delay, duration = 1.2, color = "var(--color-graphite)", width = 1.6, immediate, className, ...rest }: ScribbleProps) {
  return (
    <Svg viewBox="0 0 300 120" preserveAspectRatio="none" className={className} {...rest}>
      <Draw
        d="M6 8 C 90 4, 200 6, 294 7 C 295 40, 293 80, 294 113 C 200 116, 100 114, 7 113 C 5 80, 7 40, 4 10"
        delay={delay}
        duration={duration}
        color={color}
        width={width}
        immediate={immediate}
      />
    </Svg>
  );
}
