"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { BrandMark } from "@/components/landing/logo";
import { cn, initials } from "@/lib/utils";

const ease = [0.22, 0.61, 0.21, 1] as const;

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[8px] border border-line bg-panel shadow-[0_1px_0_rgba(57,28,37,0.03)]", className)}>{children}</div>;
}

export function CardHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line-2 px-5 py-4">
      <div className="min-w-0">
        <h3 className="font-sans text-[14.5px] font-semibold tracking-[-0.015em]">{title}</h3>
        {sub && <p className="mt-0.5 text-[12.5px] text-label">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "green" | "red" | "amber" | "burgundy";
const tones: Record<Tone, string> = {
  neutral: "bg-[#f1eadf] text-muted",
  green: "bg-green-soft text-green",
  red: "bg-pencil-soft text-pencil",
  amber: "bg-amber-soft text-amber",
  burgundy: "bg-[#efe3e6] text-burgundy",
};

export function Pill({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11.5px] font-semibold leading-[1.35]", tones[tone], className)}>{children}</span>;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-line bg-[#f4ede3] text-[11px] font-semibold text-burgundy", className)}>
      {initials(name)}
    </span>
  );
}

/** A span so it is valid inside text (p, label); block unless the caller asks for inline-block. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const inline = className?.includes("inline-block");
  return <span aria-hidden className={cn("skeleton", !inline && "block", className)} style={style} />;
}

export function Settle({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <div className={cn("settle", className)} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <BrandMark className="h-8 w-8 opacity-90" assemble />
      <p className="mt-4 text-[14.5px] font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-[340px] text-[13.5px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Loader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10">
      <BrandMark className="h-7 w-7" pulse />
      {label && <p className="text-[13px] text-label">{label}</p>}
    </div>
  );
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

/** Closes on backdrop click, Close button and Escape. */
export function Modal({ open, onClose, title, children, width = 620 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEscape(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="fixed inset-0 bg-[#2c141c]/25 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            className="relative w-full rounded-[10px] border border-line bg-panel shadow-[0_30px_80px_-30px_rgba(57,28,37,0.45)]"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.3, ease }}
          >
            <div className="flex items-center justify-between border-b border-line-2 px-5 py-3.5">
              <div className="text-[14.5px] font-semibold text-ink">{title}</div>
              <button onClick={onClose} className="rounded-[6px] p-1 text-label hover:bg-black/[0.04] hover:text-ink" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Drawer({ open, onClose, children, width = 480 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  useEscape(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[#2c141c]/15" onClick={onClose} />
          <motion.aside
            className="quiet-scroll absolute inset-y-0 right-0 w-full overflow-y-auto border-l border-line bg-panel shadow-[0_0_60px_-20px_rgba(57,28,37,0.35)]"
            style={{ maxWidth: width }}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.35, ease }}
          >
            <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-[6px] p-1 text-label hover:bg-black/[0.04] hover:text-ink" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export async function brandConfetti(strength = 1) {
  const confetti = (await import("canvas-confetti")).default;
  const colors = ["#d94a38", "#391c25", "#e8a193", "#f6f1e8"];
  const base = { colors, shapes: ["square" as const], scalar: 0.9, ticks: 220, disableForReducedMotion: true };
  confetti({ ...base, particleCount: Math.round(70 * strength), spread: 70, startVelocity: 38, origin: { x: 0.5, y: 0.35 } });
  setTimeout(() => confetti({ ...base, particleCount: Math.round(40 * strength), angle: 60, spread: 55, origin: { x: 0, y: 0.6 } }), 150);
  setTimeout(() => confetti({ ...base, particleCount: Math.round(40 * strength), angle: 120, spread: 55, origin: { x: 1, y: 0.6 } }), 300);
}
