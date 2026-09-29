"use client";

import { motion, type Variants } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import rough from "roughjs";
import type { Drawable } from "roughjs/bin/core";
import { Draw } from "@/components/sketch/draw";
import type { Deck, DeckChart, DeckSlide } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Slides are laid out at the PDF's size and scaled to fit, so type and charts match the download. */
export const SLIDE_W = 960;
export const SLIDE_H = 540;

const ease = [0.22, 0.61, 0.21, 1] as const;
const gen = rough.generator();
const INK = "var(--color-ink)";
const ACCENT = "var(--color-vermilion)";
const GRAPHITE = "var(--color-graphite)";
const LABEL = "var(--color-label)";

const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } } };
const rise: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease } } };

const paths = (d: Drawable) => gen.toPaths(d);

/** A roughjs path that draws itself in, or sits still in thumbnails. */
function Pencil({ p, still, delay = 0, duration = 0.8 }: { p: ReturnType<typeof paths>[number]; still?: boolean; delay?: number; duration?: number }) {
  const fill = p.fill && p.fill !== "none" ? p.fill : "none";
  if (still) return <path d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={fill} strokeLinecap="round" strokeLinejoin="round" />;
  return <Draw d={p.d} color={p.stroke} width={p.strokeWidth} fill={fill} immediate delay={delay} duration={duration} />;
}

/** "$k" -> "$120k", "%" -> "40%", "customers" -> "40 customers". Mirrors the PDF renderer. */
export function formatValue(v: number, unit: string) {
  const u = unit.trim();
  const m = u.match(/^([$£€])(.*)$/);
  if (m) return `${m[1]}${v}${m[2]}`;
  if (u === "%" || u === "k" || u === "m") return `${v}${u}`;
  return u ? `${v} ${u}` : `${v}`;
}

export function hasChart(c: DeckChart | null | undefined) {
  return Boolean(c && c.kind !== "none" && Math.min(c.labels.length, c.values.length) > 0);
}

const CW = 400;
const CH = 262;

/** Hand-drawn bar or line chart. Bars grow from the baseline; the line strokes in and its points pop on. */
export function SketchChart({ chart, seed, still }: { chart: DeckChart; seed: number; still?: boolean }) {
  const geo = useMemo(() => {
    const n = Math.min(chart.labels.length, chart.values.length);
    const values = chart.values.slice(0, n).map((v) => (Number.isFinite(v) ? Math.max(0, v) : 0));
    const max = Math.max(...values, 1);
    const x0 = 6;
    const y0 = CH - 26;
    const plotH = y0 - 34;
    const plotW = CW - 12;
    const step = plotW / Math.max(n, 1);
    const points = values.map((v, i) => ({ x: x0 + step * i + step / 2, y: y0 - (v / max) * plotH, v, label: (chart.labels[i] ?? "").slice(0, 10) }));
    const axis = paths(gen.line(x0, y0, x0 + plotW, y0, { seed, roughness: 0.9, stroke: INK, strokeWidth: 1.2 }));
    const bw = Math.min(46, step * 0.56);
    const bars =
      chart.kind === "bar"
        ? points.map((p, i) => {
            const bh = Math.max(2, y0 - p.y);
            const last = i === n - 1;
            return paths(
              gen.rectangle(p.x - bw / 2, y0 - bh, bw, bh, {
                seed: seed + i + 1,
                roughness: 0.9,
                stroke: last ? ACCENT : GRAPHITE,
                strokeWidth: 1,
                fill: last ? ACCENT : LABEL,
                fillStyle: "hachure",
                hachureGap: 4,
                fillWeight: 0.8,
              }),
            );
          })
        : [];
    const line =
      chart.kind === "line" && n > 1
        ? paths(gen.linearPath(points.map((p) => [p.x, p.y]), { seed: seed + 3, roughness: 0.8, stroke: ACCENT, strokeWidth: 2.2 }))
        : [];
    const dots = chart.kind === "line" ? points.map((p, i) => paths(gen.circle(p.x, p.y, 8, { seed: seed + 10 + i, stroke: INK, strokeWidth: 1, fill: INK, fillStyle: "solid" }))) : [];
    return { n, y0, points, axis, bars, line, dots };
  }, [chart, seed]);

  const lineTime = 1.1;
  const at = (i: number) => (chart.kind === "bar" ? 0.35 + i * 0.08 : 0.35 + (geo.n > 1 ? i / (geo.n - 1) : 0) * lineTime);

  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} className="h-auto w-full overflow-visible" role="img" aria-label={chart.title}>
      <g filter="url(#graphite)">
        {geo.axis.map((p, j) => (
          <Pencil key={j} p={p} still={still} delay={0.2} duration={0.5} />
        ))}
      </g>
      {geo.bars.map((bar, i) => (
        <motion.g
          key={i}
          style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
          initial={still ? false : { scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.75, delay: at(i), ease }}
        >
          <g filter="url(#graphite)">
            {bar.map((p, j) => (
              <path key={j} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill && p.fill !== "none" ? p.fill : "none"} strokeLinecap="round" />
            ))}
          </g>
        </motion.g>
      ))}
      <g filter="url(#graphite)">
        {geo.line.map((p, j) => (
          <Pencil key={j} p={p} still={still} delay={0.35} duration={lineTime} />
        ))}
      </g>
      {geo.dots.map((dot, i) => (
        <motion.g
          key={i}
          style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
          initial={still ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.35, delay: at(i), ease }}
        >
          {dot.map((p, j) => (
            <path key={j} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill && p.fill !== "none" ? p.fill : "none"} />
          ))}
        </motion.g>
      ))}
      {geo.points.map((p, i) => (
        <g key={i}>
          <text x={p.x} y={geo.y0 + 17} fontSize={10.5} textAnchor="middle" className="fill-label">
            {p.label}
          </text>
          <motion.text
            x={p.x}
            y={(chart.kind === "bar" ? Math.min(p.y, geo.y0 - 2) : p.y) - 12}
            fontSize={11.5}
            textAnchor="middle"
            className="tabular fill-ink font-medium"
            initial={still ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: at(i) + 0.45 }}
          >
            {formatValue(p.v, chart.unit)}
          </motion.text>
        </g>
      ))}
    </svg>
  );
}

function Underline({ width, seed, still, delay }: { width: number; seed: number; still?: boolean; delay: number }) {
  const ps = useMemo(
    () => paths(gen.curve([[3, 9], [width * 0.45, 4], [width - 3, 11]], { seed, roughness: 1, stroke: ACCENT, strokeWidth: 2.4 })),
    [width, seed],
  );
  return (
    <svg viewBox={`0 0 ${width} 16`} style={{ width }} className="h-4 overflow-visible" aria-hidden>
      <g filter="url(#graphite)">
        {ps.map((p, j) => (
          <Pencil key={j} p={p} still={still} delay={delay} duration={0.7} />
        ))}
      </g>
    </svg>
  );
}

function statSize(v: string) {
  if (v.length <= 7) return "text-[76px]";
  if (v.length <= 11) return "text-[56px]";
  return "text-[42px]";
}

interface SlideProps {
  deck: Deck;
  slide: DeckSlide;
  index: number;
  /** Render the final frame with no motion, for thumbnails. */
  still?: boolean;
  month: string;
  website?: string | null;
  contact?: string | null;
}

function Cover({ deck, slide, still, month, website }: SlideProps) {
  return (
    <div className="flex h-full flex-col px-16 pb-14 pt-[88px]">
      <motion.span variants={rise} className="block h-3 w-3 bg-vermilion" />
      <motion.h1 variants={rise} className="mt-7 line-clamp-2 max-w-[800px] font-display text-[64px] leading-[1.02] tracking-[-0.05em] text-display">
        {deck.company}
      </motion.h1>
      {deck.tagline && (
        <motion.p variants={rise} className="mt-4 line-clamp-2 max-w-[700px] text-[24px] leading-snug tracking-[-0.02em] text-muted">
          {deck.tagline}
        </motion.p>
      )}
      {slide.headline && (
        <motion.p variants={rise} className="mt-4 line-clamp-2 max-w-[700px] text-[16px] font-medium text-ink">
          {slide.headline}
        </motion.p>
      )}
      <div className="mt-6">
        <Underline width={320} seed={7} still={still} delay={0.7} />
      </div>
      <div className="mt-auto flex items-end justify-between gap-6">
        <motion.span variants={rise} className="hand text-[26px] leading-none text-graphite">
          {month ? `pitch deck, ${month}` : "pitch deck"}
        </motion.span>
        {website && (
          <motion.span variants={rise} className="text-[13px] font-medium text-ink">
            {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </motion.span>
        )}
      </div>
    </div>
  );
}

function Content({ deck, slide, index, still, contact }: SlideProps) {
  const chart = hasChart(slide.chart);
  const wide = slide.rows.length > 0;
  const side = !wide && (chart || Boolean(slide.stat_value));
  const bullets = slide.bullets.slice(0, 4);

  return (
    <>
      <div className="flex h-full flex-col px-12 pb-[58px] pt-10">
        <motion.p variants={rise} className="text-[13px] font-medium text-vermilion">
          {slide.kicker}
        </motion.p>
        <motion.h2 variants={rise} className="mt-2 line-clamp-2 max-w-[850px] font-display text-[34px] leading-[1.1] tracking-[-0.045em] text-display">
          {slide.headline}
        </motion.h2>

        <div className="mt-7 min-h-0 flex-1 overflow-hidden">
          {wide ? (
            <>
              {slide.body && (
                <motion.p variants={rise} className="mb-4 line-clamp-2 max-w-[820px] text-[15.5px] leading-relaxed text-body">
                  {slide.body}
                </motion.p>
              )}
              <div className="border-t border-line">
                {slide.rows.slice(0, 5).map((r, i) => (
                  <motion.div key={i} variants={rise} className="grid grid-cols-[30%_1fr] gap-6 border-b border-line py-3">
                    <p className="line-clamp-2 font-display text-[18px] font-semibold leading-tight tracking-[-0.03em] text-display">{r.label}</p>
                    <p className="line-clamp-2 text-[14.5px] leading-snug text-body">{r.detail}</p>
                  </motion.div>
                ))}
              </div>
            </>
          ) : (
            <div className={cn("grid h-full gap-12", side ? "grid-cols-[1fr_400px]" : "grid-cols-1")}>
              <div className={cn("min-w-0", !side && "max-w-[820px]")}>
                {slide.body && (
                  <motion.p variants={rise} className="line-clamp-4 text-[16.5px] leading-relaxed text-body">
                    {slide.body}
                  </motion.p>
                )}
                {bullets.length > 0 && (
                  <ul className={cn("space-y-3", slide.body && "mt-5")}>
                    {bullets.map((b, i) => (
                      <motion.li key={i} variants={rise} className="flex gap-3.5">
                        <span className="mt-[8px] block h-1.5 w-1.5 shrink-0 bg-vermilion" />
                        <span className="line-clamp-2 text-[16px] leading-snug text-body">{b}</span>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </div>
              {side &&
                (chart ? (
                  <motion.div variants={rise} className="min-w-0">
                    {slide.chart.title && <p className="mb-2 truncate text-[12.5px] font-medium text-muted">{slide.chart.title}</p>}
                    <SketchChart chart={slide.chart} seed={40 + index * 7} still={still} />
                  </motion.div>
                ) : (
                  <div className="flex min-w-0 flex-col justify-center pb-8">
                    <motion.p variants={rise} className={cn("font-display font-semibold leading-none tracking-[-0.055em] text-display", statSize(slide.stat_value))}>
                      {slide.stat_value}
                    </motion.p>
                    <div className="mt-3">
                      <Underline width={190} seed={9 + index} still={still} delay={0.6} />
                    </div>
                    {slide.stat_label && (
                      <motion.p variants={rise} className="mt-2 text-[16px] leading-snug text-muted">
                        {slide.stat_label}
                      </motion.p>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        {slide.type === "ask" && contact && (
          <motion.p variants={rise} className="mb-1 mt-3 text-[13.5px] font-medium text-ink">
            {contact}
          </motion.p>
        )}
      </div>
      <footer className="absolute inset-x-12 bottom-0 flex h-[42px] items-center justify-between border-t border-line text-[11px]">
        <span className="truncate font-medium text-muted">{deck.company}</span>
        <span className="tabular text-label">
          {index + 1} / {deck.slides.length}
        </span>
      </footer>
    </>
  );
}

/** One slide at 960 by 540. Place inside <ScaledFrame>. */
export function Slide(props: SlideProps) {
  const bookend = props.slide.type === "cover" || props.slide.type === "ask";
  return (
    <motion.div
      className={cn("absolute inset-0 overflow-hidden bg-paper text-left", bookend && "graph-paper")}
      variants={stagger}
      initial={props.still ? false : "hidden"}
      animate="show"
    >
      {props.slide.type === "cover" ? <Cover {...props} /> : <Content {...props} />}
    </motion.div>
  );
}

/**
 * A 16:9 box that scales a 960 by 540 canvas to its width. Pass `width` when it is fixed
 * (thumbnails) to skip measuring.
 */
export function ScaledFrame({ children, width, className }: { children: ReactNode; width?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  useEffect(() => {
    if (width || !ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => setMeasured(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  const scale = (width ?? measured) / SLIDE_W;
  return (
    <div ref={ref} className={cn("relative aspect-video overflow-hidden", !width && "w-full", className)} style={width ? { width } : undefined}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}
      >
        {children}
      </div>
    </div>
  );
}
