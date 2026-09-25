"use client";

import type { ReactNode } from "react";
import { ScribbleTick } from "@/components/sketch/draw";
import { cn } from "@/lib/utils";

export function Tile({
  selected,
  onClick,
  children,
  hotkey,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  hotkey?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group relative flex w-full flex-col items-start rounded-[8px] border bg-panel px-4 py-3.5 text-left transition-[border-color,background,box-shadow,transform] duration-150 active:translate-y-px",
        selected
          ? "border-[#a8968c] bg-[#faf5ee] shadow-[0_0_0_3px_rgba(57,28,37,0.04)]"
          : "border-line hover:border-[#d5c8ba] hover:shadow-[0_1px_0_rgba(57,28,37,0.03)]",
        className,
      )}
    >
      {children}
      {hotkey && !selected && (
        <span className="absolute right-3 top-3 rounded-[4px] border border-line px-1.5 text-[11px] text-faint opacity-0 transition-opacity group-hover:opacity-100">
          {hotkey}
        </span>
      )}
      {selected && <ScribbleTick className="absolute right-3 top-3 h-5 w-5" immediate />}
    </button>
  );
}
