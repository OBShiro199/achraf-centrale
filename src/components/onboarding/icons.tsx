"use client";

import { Draw } from "@/components/sketch/draw";

/** Hand-drawn icons for founder values, drawn in when they appear. */
const PATHS: Record<string, string[]> = {
  eco_friendly: ["M6 26 C 6 14, 14 6, 27 5 C 27 18, 20 26, 8 26 Z", "M7 25 C 12 19, 17 14, 23 9"],
  social_impact: [
    "M14 9 C 14 6.5 12.3 5 10.5 5 C 8.5 5 7 6.8 7 9 C 7 11 8.6 12.6 10.5 12.6 C 12.4 12.6 14 11 14 9 Z",
    "M3.5 26 C 3.5 20 6.5 16 10.5 16 C 14.5 16 17.5 20 17.5 26",
    "M25 10 C 25 7.8 23.5 6.5 22 6.5 C 20.3 6.5 19 8 19 10 C 19 11.8 20.4 13.2 22 13.2 C 23.6 13.2 25 11.8 25 10 Z",
    "M19.5 17.5 C 25 16.5 28.5 20.5 28.5 26",
  ],
  charity: ["M16 27 C 6 20, 3 14, 5 9.5 C 7 5.5, 13 5, 16 10 C 19 5, 25 5.5, 27 9.5 C 29 14, 26 20, 16 27 Z"],
  diversity: [
    "M18 12 C 18 8.7 15.3 6 12 6 C 8.7 6 6 8.7 6 12 C 6 15.3 8.7 18 12 18 C 15.3 18 18 15.3 18 12 Z",
    "M26 12 C 26 8.7 23.3 6 20 6 C 16.7 6 14 8.7 14 12 C 14 15.3 16.7 18 20 18 C 23.3 18 26 15.3 26 12 Z",
    "M22 20 C 22 16.7 19.3 14 16 14 C 12.7 14 10 16.7 10 20 C 10 23.3 12.7 26 16 26 C 19.3 26 22 23.3 22 20 Z",
  ],
  open_source: ["M9 8 L 9 25", "M9 18 C 9 13, 23 15, 23 10", "M11.5 6 C 11.5 4.6 10.4 3.5 9 3.5 C 7.6 3.5 6.5 4.6 6.5 6 C 6.5 7.4 7.6 8.5 9 8.5 C 10.4 8.5 11.5 7.4 11.5 6 Z", "M25.5 8 C 25.5 6.6 24.4 5.5 23 5.5 C 21.6 5.5 20.5 6.6 20.5 8 C 20.5 9.4 21.6 10.5 23 10.5 C 24.4 10.5 25.5 9.4 25.5 8 Z", "M11.5 27 C 11.5 25.6 10.4 24.5 9 24.5 C 7.6 24.5 6.5 25.6 6.5 27 C 6.5 28.4 7.6 29.5 9 29.5 C 10.4 29.5 11.5 28.4 11.5 27 Z"],
  health_wellbeing: ["M13 5.5 L 19 5.5 L 19 13 L 26.5 13 L 26.5 19 L 19 19 L 19 26.5 L 13 26.5 L 13 19 L 5.5 19 L 5.5 13 L 13 13 Z"],
  education: ["M4 8 C 9 6, 13 7, 16 10 C 19 7, 23 6, 28 8 L 28 25 C 23 23, 19 24, 16 27 C 13 24, 9 23, 4 25 Z", "M16 10 L 16 27"],
  ethical_ai: ["M16 4 C 17 12, 20 15, 28 16 C 20 17, 17 20, 16 28 C 15 20, 12 17, 4 16 C 12 15, 15 12, 16 4 Z"],
  local_community: ["M4.5 15 L 16 5.5 L 27.5 15", "M8 12.5 L 8 26.5 L 24 26.5 L 24 12.5", "M13.5 26.5 L 13.5 19 L 18.5 19 L 18.5 26.5"],
  b_corp: ["M28 16 C 28 9.4 22.6 4 16 4 C 9.4 4 4 9.4 4 16 C 4 22.6 9.4 28 16 28 C 22.6 28 28 22.6 28 16 Z", "M13 10 L 13 22", "M13 10 C 19.5 10, 19.5 16, 13 16 C 20.5 16, 20.5 22, 13 22"],
};

export function ValueIcon({ value, active }: { value: string; active?: boolean }) {
  const paths = PATHS[value] ?? PATHS.ethical_ai;
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 overflow-visible" aria-hidden>
      <g filter="url(#graphite)">
        {paths.map((d, i) => (
          <Draw key={d} d={d} immediate delay={0.1 + i * 0.15} duration={0.7} width={1.7} color={active ? "#1a7f4b" : "#6f5f62"} />
        ))}
      </g>
    </svg>
  );
}

/** A row of pencil dots, one per few people, for team size tiles. */
export function PeopleDots({ count }: { count: number }) {
  return (
    <svg viewBox={`0 0 ${count * 11} 10`} className="h-2.5 overflow-visible" style={{ width: count * 11 }} aria-hidden>
      <g filter="url(#wobble)">
        {Array.from({ length: count }, (_, i) => (
          <circle key={i} cx={5 + i * 11} cy={5} r={3.2 + ((i * 7) % 3) * 0.25} fill="#391c25" opacity={0.85} />
        ))}
      </g>
    </svg>
  );
}
