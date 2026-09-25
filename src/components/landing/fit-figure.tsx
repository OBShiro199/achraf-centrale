"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import { Draw } from "@/components/sketch/draw";
import { RoughStrokes, seeded, type Stroke } from "@/components/sketch/rough";

const W = 520;
const H = 400;
const X0 = 58;
const Y0 = 350;
const FILTER_X = 170;

type Pt = { x: number; y: number; r: number; kind: "filtered" | "scored" | "shortlist" };

function usePoints(): Pt[] {
  return useMemo(() => {
    const rand = seeded(7);
    const pts: Pt[] = [];
    for (let i = 0; i < 46; i++) {
      const x = X0 + 18 + rand() * (W - X0 - 50);
      // Investors cluster loosely along the fit curve.
      const trend = Y0 - 20 - ((x - X0) / (W - X0)) * 250;
      const y = Math.min(Y0 - 14, Math.max(34, trend + (rand() - 0.5) * 150));
      const kind: Pt["kind"] = x < FILTER_X ? "filtered" : x > 350 && y < 150 ? "shortlist" : "scored";
      pts.push({ x, y, r: 5 + rand() * 3, kind });
    }
    // Make sure the shortlist reads as a cluster.
    pts.push({ x: 402, y: 96, r: 7, kind: "shortlist" }, { x: 438, y: 78, r: 6, kind: "shortlist" }, { x: 386, y: 120, r: 6, kind: "shortlist" });
    return pts;
  }, []);
}

export function FitFigure() {
  const points = usePoints();

  return (
    <figure className="relative w-full select-none">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label="Scatter plot of investors by stage fit and sector fit, with the best-fit cluster circled">
        <RoughStrokes
          build={(g) => {
            const s: Stroke[] = [
              // Axes
              { drawable: g.line(X0, Y0, W - 14, Y0, { seed: 3, roughness: 0.9, stroke: "#3a2a2e", strokeWidth: 1.4 }), delay: 0.1, duration: 0.9 },
              { drawable: g.line(X0, Y0, X0, 18, { seed: 5, roughness: 0.9, stroke: "#3a2a2e", strokeWidth: 1.4 }), delay: 0.2, duration: 0.9 },
              { drawable: g.linearPath([[W - 24, Y0 - 6], [W - 14, Y0], [W - 24, Y0 + 6]], { seed: 8, roughness: 0.6, stroke: "#3a2a2e", strokeWidth: 1.4 }), delay: 0.95, duration: 0.2 },
              { drawable: g.linearPath([[X0 - 6, 28], [X0, 18], [X0 + 6, 28]], { seed: 9, roughness: 0.6, stroke: "#3a2a2e", strokeWidth: 1.4 }), delay: 1.05, duration: 0.2 },
              // Hard filter region, hatched like a textbook exercise.
              {
                drawable: g.rectangle(X0 + 2, 26, FILTER_X - X0 - 4, Y0 - 28, {
                  seed: 12,
                  roughness: 1.4,
                  stroke: "transparent",
                  fill: "#c2b6ad",
                  fillStyle: "hachure",
                  hachureGap: 9,
                  hachureAngle: -41,
                  fillWeight: 0.8,
                }),
                delay: 0.6,
                duration: 1.4,
              },
              { drawable: g.line(FILTER_X, 24, FILTER_X, Y0, { seed: 14, roughness: 1.1, stroke: "#9a8d88", strokeWidth: 1.1, strokeLineDash: [6, 5] }), delay: 0.5, duration: 0.8 },
              // Fit curve
              {
                drawable: g.curve(
                  [
                    [X0 + 20, Y0 - 16],
                    [190, Y0 - 60],
                    [300, 200],
                    [400, 110],
                    [W - 30, 50],
                  ],
                  { seed: 21, roughness: 0.8, stroke: "#6e6360", strokeWidth: 1.2, strokeLineDash: [2, 6] },
                ),
                delay: 1.2,
                duration: 1.4,
              },
            ];
            // Axis ticks
            for (let i = 1; i <= 7; i++) {
              const x = X0 + i * 60;
              s.push({ drawable: g.line(x, Y0 - 4, x, Y0 + 5, { seed: 30 + i, roughness: 0.5, stroke: "#9a8d88", strokeWidth: 1 }), delay: 0.9 + i * 0.03, duration: 0.15 });
            }
            for (let i = 1; i <= 5; i++) {
              const y = Y0 - i * 60;
              s.push({ drawable: g.line(X0 - 5, y, X0 + 4, y, { seed: 50 + i, roughness: 0.5, stroke: "#9a8d88", strokeWidth: 1 }), delay: 0.9 + i * 0.03, duration: 0.15 });
            }
            return s;
          }}
        />

        {/* Investors */}
        {points.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.kind === "shortlist" ? p.r * 0.72 : p.r * 0.6}
            fill={p.kind === "shortlist" ? "#391c25" : p.kind === "filtered" ? "#f6f1e8" : "#f6f1e8"}
            stroke={p.kind === "filtered" ? "#c4b9b0" : p.kind === "shortlist" ? "#391c25" : "#6f5f62"}
            strokeWidth={1.3}
            filter="url(#graphite)"
            initial={{ opacity: 0, scale: 0.2 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 1.1 + i * 0.025, duration: 0.35, ease: [0.22, 0.61, 0.21, 1] }}
            style={{ transformOrigin: `${p.x}px ${p.y}px` }}
          />
        ))}

        {/* The red pencil loop around the shortlist */}
        <g filter="url(#graphite)">
          <Draw
            d="M372 70 C 400 48, 468 44, 482 70 C 496 98, 452 150, 404 152 C 360 154, 344 128, 352 102 C 360 78, 402 60, 446 58"
            color="#d94a38"
            width={2.2}
            delay={2.4}
            duration={1.1}
          />
          <Draw d="M338 196 C 330 176, 336 160, 356 146" color="#d94a38" width={1.6} delay={3.2} duration={0.5} />
          <Draw d="M346 146 L 357 145 L 356 156" color="#d94a38" width={1.6} delay={3.6} duration={0.2} />
        </g>

        <motion.g initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 3.4, duration: 0.6 }}>
          <text x={286} y={222} className="hand" fontSize={24} fill="#d94a38">
            your shortlist
          </text>
          <text x={296} y={244} className="hand" fontSize={18} fill="#6e6360">
            50 investors, ranked
          </text>
        </motion.g>

        <motion.g initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 1.8, duration: 0.6 }}>
          <rect x={X0 + 10} y={Y0 - 78} width={96} height={46} fill="#f6f1e8" />
          <text x={X0 + 16} y={Y0 - 58} className="hand" fontSize={19} fill="#6f5f62">
            filtered out
          </text>
          <text x={X0 + 16} y={Y0 - 38} className="hand" fontSize={16} fill="#9a8d88">
            wrong stage
          </text>
          <text x={W - 118} y={Y0 + 30} className="hand" fontSize={18} fill="#6f5f62">
            stage fit
          </text>
          <text x={X0 - 14} y={16} className="hand" fontSize={18} fill="#6f5f62" textAnchor="end" transform={`rotate(-90 ${X0 - 14} 16)`}>
            sector fit
          </text>
          <text x={X0 - 12} y={Y0 + 20} className="hand" fontSize={16} fill="#9a8d88">
            0
          </text>
        </motion.g>
      </svg>

      <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line pt-3 text-[12.5px] text-label">
        <span>
          <span className="text-muted">Fig. 1</span>&nbsp;&nbsp;Investor fit for a seed-stage climate startup. Each point is an investor.
        </span>
        <span className="hand text-[19px] text-ink">
          fit(i) = 30·sector + 20·stage + θ·thesis
        </span>
      </figcaption>
    </figure>
  );
}
