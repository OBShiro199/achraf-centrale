import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background,border-color,color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px";

const variants: Record<Variant, string> = {
  primary: "bg-night text-ivory hover:bg-[#2a131b] border border-night",
  secondary: "bg-panel text-ink border border-[#dccfc2] hover:border-[#c2b6ad] shadow-[0_1px_0_rgba(57,28,37,0.03)]",
  ghost: "text-muted hover:text-ink hover:bg-black/[0.035] border border-transparent",
  danger: "bg-panel text-pencil border border-[#f0cfc6] hover:border-pencil/60",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-[14px]",
  lg: "h-12 px-6 text-[15px]",
};

type Common = { variant?: Variant; size?: Size; square?: boolean; className?: string; children: ReactNode };

export function buttonClass({ variant = "secondary", size = "md", square, className }: Omit<Common, "children">) {
  return cn(base, variants[variant], sizes[size], square ? "rounded-none" : "rounded-[6px]", className);
}

export function Button({ variant, size, square, className, ...props }: Common & ComponentProps<"button">) {
  return <button className={buttonClass({ variant, size, square, className })} {...props} />;
}

export function ButtonLink({ variant, size, square, className, ...props }: Common & ComponentProps<typeof Link>) {
  return <Link className={buttonClass({ variant, size, square, className })} {...props} />;
}
