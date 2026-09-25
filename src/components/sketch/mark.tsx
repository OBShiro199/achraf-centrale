"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { annotate } from "rough-notation";
import type { RoughAnnotationConfig } from "rough-notation/lib/model";

type Props = {
  children: ReactNode;
  type?: RoughAnnotationConfig["type"];
  color?: string;
  strokeWidth?: number;
  padding?: RoughAnnotationConfig["padding"];
  iterations?: number;
  duration?: number;
  delay?: number;
  brackets?: RoughAnnotationConfig["brackets"];
  multiline?: boolean;
  className?: string;
};

/** Hand-drawn annotation around inline text, drawn when it scrolls into view. */
export function Mark({
  children,
  type = "underline",
  color = "#d94a38",
  strokeWidth = 2,
  padding = 3,
  iterations = 2,
  duration = 900,
  delay = 0,
  brackets,
  multiline = true,
  className,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const config = { type, color, strokeWidth, padding, iterations, brackets, multiline };
    let a = annotate(el, { ...config, animationDuration: duration });
    let shown = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        // Measure only after web fonts settle, or the drawing lands where the fallback font was.
        void document.fonts.ready.then(() => {
          timer = setTimeout(() => {
            a.show();
            shown = true;
          }, delay);
        });
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);

    // Redraw (without animating) whenever the text reflows.
    let last = `${el.offsetWidth}x${el.offsetHeight}`;
    const ro = new ResizeObserver(() => {
      const size = `${el.offsetWidth}x${el.offsetHeight}`;
      if (size === last || !shown) return;
      last = size;
      a.remove();
      a = annotate(el, { ...config, animate: false });
      a.show();
    });
    ro.observe(el);

    return () => {
      io.disconnect();
      ro.disconnect();
      if (timer) clearTimeout(timer);
      a.remove();
    };
  }, [type, color, strokeWidth, padding, iterations, duration, delay, brackets, multiline]);

  // rough-notation inserts its SVG next to the measured element, so the wrapper must be the
  // containing block; otherwise a parent's reveal transform shifts the drawing when it ends.
  return (
    <span className="relative inline-block">
      <span ref={ref} className={className}>
        {children}
      </span>
    </span>
  );
}
