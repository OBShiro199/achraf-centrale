"use client";

import { useMemo } from "react";
import rough from "roughjs";
import type { RoughGenerator } from "roughjs/bin/generator";
import type { Drawable } from "roughjs/bin/core";
import { Draw } from "./draw";

export type Stroke = { drawable: Drawable; delay?: number; duration?: number; immediate?: boolean };

/** Renders roughjs drawables as self-drawing pencil paths. `build` must be deterministic (pass seeds). */
export function RoughStrokes({ build, memoKey = "" }: { build: (g: RoughGenerator) => Stroke[]; memoKey?: string }) {
  // `build` is an inline closure; its output only changes when memoKey does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const strokes = useMemo(() => build(rough.generator()), [memoKey]);
  const gen = useMemo(() => rough.generator(), []);
  return (
    <g filter="url(#graphite)">
      {strokes.flatMap((s, i) =>
        gen.toPaths(s.drawable).map((p, j) => (
          <Draw
            key={`${i}-${j}`}
            d={p.d}
            color={p.stroke}
            width={p.strokeWidth}
            fill={p.fill && p.fill !== "none" ? p.fill : "none"}
            delay={s.delay}
            duration={s.duration ?? 0.8}
            immediate={s.immediate}
          />
        )),
      )}
    </g>
  );
}

/** Small seeded PRNG so figures are identical on server and client. */
export function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
