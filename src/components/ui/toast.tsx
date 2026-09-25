"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/landing/logo";

type Toast = { id: number; title: string; body?: string; tone?: "default" | "error" };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 5200);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[340px] max-w-[calc(100vw-40px)] flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.3, ease: [0.22, 0.61, 0.21, 1] }}
              className="pointer-events-auto flex gap-3 rounded-[8px] border border-line bg-panel px-4 py-3 shadow-[0_18px_40px_-20px_rgba(57,28,37,0.35)]"
            >
              <BrandMark className="mt-0.5 h-4 w-4" color={t.tone === "error" ? "var(--color-burgundy)" : "var(--color-vermilion)"} assemble />
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{t.body}</p>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
