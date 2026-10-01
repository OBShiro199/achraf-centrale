"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Eases its height to whatever its content measures, so content that grows, shrinks or swaps
 * reshapes smoothly instead of snapping. The inner padding keeps focus rings and shadows from
 * being clipped while the height animates.
 */
export function AutoHeight({ children, className, duration = 0.32 }: { children: ReactNode; className?: string; duration?: number }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className={cn("-m-1.5 overflow-clip", className)}
      style={{
        height: height == null ? "auto" : height,
        transition: height == null ? undefined : `height ${duration}s cubic-bezier(0.22, 0.61, 0.21, 1)`,
      }}
    >
      <div ref={inner} className="p-1.5">
        {children}
      </div>
    </div>
  );
}
