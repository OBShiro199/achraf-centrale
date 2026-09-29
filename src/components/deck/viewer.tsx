"use client";

import { AnimatePresence, motion, type Variants } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ScaledFrame, Slide } from "@/components/deck/slide";
import { Button } from "@/components/ui/button";
import type { Deck } from "@/lib/types";
import { cn } from "@/lib/utils";

const ease = [0.22, 0.61, 0.21, 1] as const;
const THUMB_W = 128;

const turn: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 48 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.45, ease } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -48, transition: { duration: 0.3, ease } }),
};

/** Slide-by-slide deck reader: arrow keys, swipe, prev and next, and a thumbnail strip. */
export function DeckViewer({ deck, month, website, contact }: { deck: Deck; month: string; website?: string | null; contact?: string | null }) {
  const [[index, dir], setPos] = useState<[number, number]>([0, 0]);
  const total = deck.slides.length;
  const strip = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);

  const go = useCallback(
    (n: number) => {
      setPos(([cur]) => {
        const next = Math.max(0, Math.min(total - 1, n));
        return next === cur ? [cur, 0] : [next, next > cur ? 1 : -1];
      });
    },
    [total],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPos(([cur]) => (cur < total - 1 ? [cur + 1, 1] : [cur, 0]));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPos(([cur]) => (cur > 0 ? [cur - 1, -1] : [cur, 0]));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  // Keep the current thumbnail in view without scrolling the page.
  useEffect(() => {
    const el = strip.current?.children[index] as HTMLElement | undefined;
    if (!strip.current || !el) return;
    strip.current.scrollTo({ left: el.offsetLeft - strip.current.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [index]);

  const slide = deck.slides[index];
  if (!slide) return null;

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-[8px] border border-line bg-paper shadow-[0_30px_60px_-40px_rgba(57,28,37,0.45)]"
        onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          const end = e.changedTouches[0]?.clientX;
          if (start == null || end == null || Math.abs(end - start) < 40) return;
          go(index + (end < start ? 1 : -1));
        }}
      >
        <ScaledFrame>
          <AnimatePresence initial={false} custom={dir}>
            <motion.div key={index} custom={dir} variants={turn} initial="enter" animate="center" exit="exit" className="absolute inset-0">
              <Slide deck={deck} slide={slide} index={index} month={month} website={website} contact={contact} />
            </motion.div>
          </AnimatePresence>
        </ScaledFrame>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button size="sm" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous slide">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <p className="min-w-0 truncate text-center text-[13px] text-label" aria-live="polite">
          <span className="tabular text-ink">
            Slide {index + 1} of {total}
          </span>
          {slide.kicker && <span className="hidden sm:inline">, {slide.kicker.toLowerCase()}</span>}
        </p>
        <Button size="sm" onClick={() => go(index + 1)} disabled={index === total - 1} aria-label="Next slide">
          <span className="hidden sm:inline">Next</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div ref={strip} className="quiet-scroll relative mt-4 flex gap-2.5 overflow-x-auto pb-2">
        {deck.slides.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={`Slide ${i + 1}: ${s.kicker || s.headline}`}
            aria-current={i === index}
            className={cn(
              "relative shrink-0 overflow-hidden rounded-[5px] border transition-[border-color,box-shadow,opacity] duration-200",
              i === index ? "border-ink shadow-[0_0_0_3px_rgba(57,28,37,0.08)]" : "border-line opacity-70 hover:border-faint hover:opacity-100",
            )}
          >
            <ScaledFrame width={THUMB_W}>
              <Slide deck={deck} slide={s} index={i} month={month} website={website} contact={contact} still />
            </ScaledFrame>
            {i === index && <motion.span layoutId="deck-thumb" className="absolute inset-x-0 bottom-0 h-[3px] bg-vermilion" transition={{ duration: 0.35, ease }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
