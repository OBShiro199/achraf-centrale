"use client";

import { Textarea } from "@/components/ui/field";
import { DECK_QUESTIONS, type DeckInputs } from "@/lib/deck";
import { cn } from "@/lib/utils";

/** The five deck questions on a ruled worksheet, numbered in pencil in the margin. */
export function DeckAnswers({
  value,
  onChange,
  autoFocus,
  className,
}: {
  value: DeckInputs;
  onChange: (v: DeckInputs) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("margin-rule rounded-[4px] border border-line bg-panel py-1 pl-16 pr-5 shadow-[0_1px_0_rgba(57,28,37,0.03)]", className)}>
      {DECK_QUESTIONS.map((q, i) => (
        <label key={q.key} className="relative block border-b border-line-2 py-4 last:border-b-0">
          <span className="hand absolute -left-10 top-3 text-[24px] leading-none text-pencil" aria-hidden>
            {i + 1}
          </span>
          <span className="block text-[14px] font-medium tracking-[-0.015em] text-ink">{q.label}</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-label">{q.hint}</span>
          <Textarea
            autoFocus={autoFocus && i === 0}
            rows={q.key === "team" ? 4 : 3}
            placeholder={q.placeholder}
            value={value[q.key] ?? ""}
            onChange={(e) => onChange({ ...value, [q.key]: e.target.value })}
            className="mt-2.5 min-h-[76px] text-[14px]"
          />
        </label>
      ))}
    </div>
  );
}
