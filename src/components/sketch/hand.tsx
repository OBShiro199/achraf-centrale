import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Pencil handwriting for margin notes. Use sparingly. */
export function Hand({
  children,
  className,
  tilt = -2,
  tone = "graphite",
}: {
  children: ReactNode;
  className?: string;
  tilt?: number;
  tone?: "graphite" | "pencil" | "ink";
}) {
  const color = tone === "pencil" ? "text-pencil" : tone === "ink" ? "text-ink" : "text-graphite";
  return (
    <span className={cn("hand inline-block leading-none", color, className)} style={{ transform: `rotate(${tilt}deg)` }}>
      {children}
    </span>
  );
}
