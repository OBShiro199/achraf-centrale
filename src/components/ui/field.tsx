import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-10 w-full rounded-[6px] border border-[#ddd2c5] bg-panel px-3 text-[14.5px] text-ink placeholder:text-faint shadow-[0_1px_0_rgba(57,28,37,0.02)] transition-[border-color,box-shadow] focus:border-[#ae9d92] focus:outline-none focus:ring-[3px] focus:ring-black/[0.05] disabled:bg-panel-2 disabled:text-muted";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "h-auto min-h-[96px] py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(inputClass, "appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8", className)} style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 4.5l3 3 3-3' fill='none' stroke='%238f8f89' stroke-width='1.4'/></svg>\")" }} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12.5px] text-label">{hint}</span>}
    </label>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-[6px] border border-[#f0cfc6] bg-pencil-soft/60 px-3 py-2 text-[13.5px] text-pencil">{children}</p>;
}
