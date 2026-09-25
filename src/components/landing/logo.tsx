"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { BRAND, cn } from "@/lib/utils";

// The Centrale mark: four rounded tiles around a centre. Geometry traced from the brand PNG.
const TILES = [
  { x: 35.5, y: 0, w: 29, h: 36, from: { x: 0, y: -18 } },
  { x: 0, y: 35.5, w: 36, h: 29, from: { x: -18, y: 0 } },
  { x: 64, y: 35.5, w: 36, h: 29, from: { x: 18, y: 0 } },
  { x: 35.5, y: 64, w: 29, h: 36, from: { x: 0, y: 18 } },
];

/**
 * Vector version of the mark for small sizes and motion.
 * `assemble` flies the tiles in from outside; `pulse` makes them breathe in turn (used as a loader).
 */
export function BrandMark({
  className,
  color = "var(--color-vermilion)",
  assemble,
  pulse,
  delay = 0,
  onView,
}: {
  className?: string;
  color?: string;
  assemble?: boolean;
  pulse?: boolean;
  delay?: number;
  /** Start the animation when scrolled into view rather than on mount. */
  onView?: boolean;
}) {
  return (
    <svg viewBox="0 0 100 100" className={cn("h-5 w-5 shrink-0", className)} aria-hidden>
      {TILES.map((t, i) => (
        <motion.rect
          key={i}
          x={t.x}
          y={t.y}
          width={t.w}
          height={t.h}
          rx={9}
          fill={color}
          style={{ transformOrigin: "50px 50px", transformBox: "view-box" }}
          initial={assemble ? { opacity: 0, x: t.from.x, y: t.from.y } : false}
          {...(onView && !pulse
            ? { whileInView: { opacity: 1, x: 0, y: 0 }, viewport: { once: true } }
            : { animate: pulse ? { opacity: [1, 0.35, 1], scale: [1, 0.92, 1] } : { opacity: 1, x: 0, y: 0 } })}
          transition={
            pulse
              ? { duration: 1.4, repeat: Infinity, delay: delay + i * 0.18, ease: "easeInOut" }
              : { duration: 0.7, delay: delay + i * 0.08, ease: [0.22, 0.61, 0.21, 1] }
          }
        />
      ))}
    </svg>
  );
}

/** The transparent PNG wordmark supplied by Centrale. */
export function Wordmark({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/centrale-wordmark.png"
      alt={BRAND}
      width={132}
      height={24}
      sizes="160px"
      priority={priority}
      className={cn("h-6 w-auto", className)}
    />
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center", className)} aria-label={`${BRAND} home`}>
      <Wordmark priority />
    </Link>
  );
}
