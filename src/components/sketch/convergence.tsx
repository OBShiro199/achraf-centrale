"use client";

import { motion } from "motion/react";
import { BrandMark } from "@/components/landing/logo";
import { RoughStrokes, type Stroke } from "./rough";
import { Draw } from "./draw";

/**
 * The brand banner's idea, drawn in pencil: many applications flowing into one Centrale hub.
 * Cards draw themselves, the connecting lines follow, then the mark assembles in the hub.
 */
export function Convergence({ className, immediate }: { className?: string; immediate?: boolean }) {
  const cards = [
    { x: 8, y: 8 },
    { x: 58, y: 78 },
    { x: 20, y: 148 },
    { x: 58, y: 218 },
    { x: 8, y: 288 },
  ];
  const hub = { x: 300, y: 150, w: 96, h: 96 };
  const hubCy = hub.y + hub.h / 2;

  return (
    <svg viewBox="0 0 410 350" className={className} aria-hidden>
      <RoughStrokes
        build={(g) => {
          const s: Stroke[] = [];
          cards.forEach((c, i) => {
            s.push({
              drawable: g.rectangle(c.x, c.y, 70, 52, { seed: 100 + i, roughness: 1.1, stroke: "#391c25", strokeWidth: 1.3, fill: "#fffdf9", fillStyle: "solid" }),
              delay: 0.1 + i * 0.12,
              duration: 0.7,
              immediate,
            });
            [14, 24, 34].forEach((dy, j) => {
              s.push({
                drawable: g.line(c.x + 12, c.y + dy, c.x + (j === 2 ? 40 : 56), c.y + dy, { seed: 200 + i * 5 + j, roughness: 0.6, stroke: "#9a8d88", strokeWidth: 1 }),
                delay: 0.4 + i * 0.12 + j * 0.05,
                duration: 0.25,
                immediate,
              });
            });
            const sx = c.x + 70;
            const sy = c.y + 26;
            const ty = hubCy - 24 + i * 12;
            s.push({
              drawable: g.curve(
                [
                  [sx, sy],
                  [sx + 70, sy],
                  [hub.x - 60, ty],
                  [hub.x, ty],
                ],
                { seed: 300 + i, roughness: 0.7, stroke: "#6f5f62", strokeWidth: 1.1 },
              ),
              delay: 0.9 + i * 0.1,
              duration: 0.9,
              immediate,
            });
          });
          s.push({
            drawable: g.rectangle(hub.x, hub.y, hub.w, hub.h, { seed: 400, roughness: 1, stroke: "#391c25", strokeWidth: 1.5, fill: "#fffdf9", fillStyle: "solid" }),
            delay: 0.7,
            duration: 0.8,
            immediate,
          });
          return s;
        }}
      />
      <foreignObject x={hub.x + 22} y={hub.y + 22} width={52} height={52}>
        <BrandMark className="h-[52px] w-[52px]" assemble onView={!immediate} delay={1.7} />
      </foreignObject>
      <motion.g initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 2.4 }}>
        <g filter="url(#graphite)">
          <Draw d="M300 268 C 316 282, 350 284, 372 272" color="#d94a38" width={1.8} immediate={immediate} delay={2.5} duration={0.6} />
        </g>
        <text x={296} y={300} className="hand" fontSize={19} fill="#d94a38">
          one platform
        </text>
      </motion.g>
    </svg>
  );
}
