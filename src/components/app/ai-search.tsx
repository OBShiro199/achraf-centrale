"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock, Pencil, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Textarea } from "@/components/ui/field";
import { Card, Modal } from "@/components/ui/kit";
import { recentAiSearches, type AiSearchResult, type AiSearchRow } from "@/lib/directory";
import { callFunction } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const AI_PROMPT_MAX = 1000;

export const AI_EXAMPLES = [
  "Seed fintech partners in London I can email",
  "Angels who back climate startups in Europe, not private equity",
  "Managing partners at small AI-focused firms founded after 2015, one per firm",
  "Strong fits for my startup in the US who have not been contacted",
];

const toResult = (r: AiSearchRow): AiSearchResult => ({
  id: r.id,
  title: r.title || r.prompt,
  summary: r.summary ?? "",
  notes: r.notes ?? [],
  filters: r.filters ?? {},
  prompt: r.prompt,
});

interface Run {
  prompt: string;
  stage: number;
  error: string | null;
}

/** Each step's share of the bar: the first two creep while Claude works, the rest jump as real stages finish. */
function creep(stage: number, ms: number) {
  if (stage <= 1) return 0.04 + 0.54 * (1 - Math.exp(-ms / 2600));
  if (stage === 2) return 0.62 + 0.28 * (1 - Math.exp(-ms / 1200));
  return 1;
}

function StepIcon({ state }: { state: "done" | "current" | "todo" | "failed" }) {
  if (state === "done")
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-soft text-green">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  if (state === "failed")
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-pencil-soft text-pencil">
        <X className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  if (state === "current") return <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-vermilion" aria-hidden />;
  return <span className="h-4 w-4 rounded-full border border-line" aria-hidden />;
}

/**
 * The AI search composer. The founder describes the investors they want; the ai-search function turns
 * that into ordinary filters. `onApply` puts the filters on the page and resolves once the first page of
 * results has loaded, so the dialog closes onto a finished list.
 */
export function AiSearch({
  expanded,
  onExpandedChange,
  prompt,
  onPromptChange,
  focusSignal,
  onApply,
  directorySize,
}: {
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  prompt: string;
  onPromptChange: (p: string) => void;
  /** Bump to focus the box (Edit prompt, New search). */
  focusSignal: number;
  onApply: (result: AiSearchResult) => Promise<void> | void;
  directorySize: number | null;
}) {
  const [run, setRun] = useState<Run | null>(null);
  const [progress, setProgress] = useState(0);
  const [recent, setRecent] = useState<AiSearchRow[]>([]);
  const runId = useRef(0);
  const stage = useRef({ n: 0, at: 0 });
  const box = useRef<HTMLTextAreaElement>(null);
  const wantFocus = useRef(false);
  // The search outlives several renders of the page, so it calls the latest onApply.
  const apply = useRef(onApply);
  useEffect(() => {
    apply.current = onApply;
  });

  const loadRecent = useCallback(async () => {
    setRecent(await recentAiSearches(6));
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  // Focus the box when asked, or when the founder expands the collapsed row.
  useEffect(() => {
    if (!expanded || (!focusSignal && !wantFocus.current)) return;
    wantFocus.current = false;
    const el = box.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [expanded, focusSignal]);

  const active = !!run && !run.error;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      const s = stage.current;
      const ms = Date.now() - s.at;
      if (s.n === 0 && ms > 1400) {
        stage.current = { n: 1, at: s.at };
        setRun((r) => (r && !r.error ? { ...r, stage: 1 } : r));
      }
      if (s.n <= 2) setProgress((p) => Math.max(p, creep(stage.current.n, ms)));
    }, 120);
    return () => clearInterval(t);
  }, [active]);

  const toStage = (n: number) => {
    stage.current = { n, at: n <= 1 ? stage.current.at : Date.now() };
    setRun((r) => (r ? { ...r, stage: n } : r));
  };

  async function submit(text: string) {
    const p = text.trim().slice(0, AI_PROMPT_MAX);
    if (p.length < 3) return;
    const id = ++runId.current;
    stage.current = { n: 0, at: Date.now() };
    setProgress(0.04);
    setRun({ prompt: p, stage: 0, error: null });

    let res: AiSearchResult;
    try {
      res = await callFunction<AiSearchResult>("ai-search", { prompt: p });
    } catch (err) {
      if (id !== runId.current) return;
      setRun({ prompt: p, stage: stage.current.n, error: err instanceof Error ? err.message : "Could not run that search" });
      return;
    }
    if (id !== runId.current) return;

    setProgress(0.62);
    toStage(2);
    try {
      await apply.current(res);
    } catch {
      // The page shows its own error state for the search itself.
    }
    if (id !== runId.current) return;

    toStage(3);
    setProgress(1);
    await new Promise((r) => setTimeout(r, 380));
    if (id !== runId.current) return;
    runId.current++;
    setRun(null);
    void loadRecent();
  }

  const cancel = () => {
    runId.current++;
    setRun(null);
  };

  const size = directorySize ? (Math.floor(directorySize / 1000) * 1000).toLocaleString("en-GB") : "335,000";
  const steps = ["Reading your request", "Matching it to real filters", `Searching ${size} investors`, "Preparing your list"];
  const len = prompt.length;

  return (
    <>
      {expanded ? (
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <label htmlFor="ai-search-prompt" className="flex items-center gap-2 text-[14.5px] font-semibold tracking-[-0.015em] text-ink">
                <Sparkles className="h-4 w-4 text-vermilion" /> Describe the investors you want
              </label>
              <p className="mt-0.5 text-[12.5px] text-label">Claude turns it into filters you can check and edit.</p>
            </div>
            <button onClick={() => onExpandedChange(false)} className="rounded-[5px] px-1.5 py-0.5 text-[12.5px] text-label hover:text-ink">
              Hide
            </button>
          </div>
          <Textarea
            ref={box}
            id="ai-search-prompt"
            value={prompt}
            maxLength={AI_PROMPT_MAX}
            rows={3}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit(prompt);
              }
            }}
            placeholder="For example: partners at seed funds in Berlin who back B2B software"
            className="mt-3 min-h-[80px] text-[14px]"
          />
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {AI_EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  onPromptChange(ex);
                  box.current?.focus();
                }}
                className="rounded-[5px] border border-line bg-panel-2 px-2 py-1 text-left text-[12.5px] text-muted transition-colors hover:border-faint hover:text-ink"
              >
                {ex}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className={cn("tabular text-[12px]", len > AI_PROMPT_MAX - 100 ? "text-amber" : "text-label")}>
              {len.toLocaleString("en-GB")} of 1,000 characters. Cmd or Ctrl and Enter searches.
            </span>
            <Button variant="primary" size="sm" disabled={prompt.trim().length < 3 || active} onClick={() => void submit(prompt)}>
              <Sparkles className="h-3.5 w-3.5" /> Search
            </Button>
          </div>
          {recent.length > 0 && (
            <div className="mt-4 border-t border-line-2 pt-3">
              <p className="px-2 text-[11px] font-medium uppercase tracking-[0.06em] text-faint">Recent searches</p>
              <ul className="mt-1">
                {recent.slice(0, 4).map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => {
                        onPromptChange(r.prompt);
                        void onApply(toResult(r));
                      }}
                      className="flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left hover:bg-black/[0.03] focus-visible:bg-black/[0.04] focus-visible:outline-none"
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0 text-faint" />
                      <span className="min-w-0 shrink-0 truncate text-[13px] text-ink sm:max-w-[45%]">{r.title || r.prompt}</span>
                      <span className="hidden min-w-0 flex-1 truncate text-[12.5px] text-label sm:block">{r.prompt}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
          <Button
            size="sm"
            onClick={() => {
              wantFocus.current = true;
              onExpandedChange(true);
            }}
          >
            <Sparkles className="h-3.5 w-3.5 text-vermilion" /> Search with AI
          </Button>
          <span className="text-[12.5px] text-label">Describe the investors you want and Claude sets the filters.</span>
        </Card>
      )}

      <Modal open={!!run} onClose={cancel} title={run?.error ? "That search did not finish" : "Searching with AI"} width={460}>
        {run && (
          <>
            <div className="px-5 py-4">
              <p className="line-clamp-2 text-[13px] italic text-muted">&ldquo;{run.prompt}&rdquo;</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                <div
                  className={cn("h-full rounded-full transition-[width] duration-500 ease-out", run.error ? "bg-faint" : "bg-vermilion")}
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <ol className="mt-4 space-y-2.5" aria-live="polite">
                {steps.map((s, i) => {
                  const state = run.error && i === run.stage ? "failed" : i < run.stage || (!run.error && progress >= 1) ? "done" : i === run.stage && !run.error ? "current" : "todo";
                  return (
                    <li key={s} className="flex items-center gap-2.5 text-[13.5px]">
                      <StepIcon state={state} />
                      <span className={cn(state === "todo" ? "text-label" : "text-ink", state === "current" && "font-medium")}>{s}</span>
                    </li>
                  );
                })}
              </ol>
              {run.error && (
                <div className="mt-4">
                  <FormError>{run.error}</FormError>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-line-2 px-5 py-3">
              {run.error ? (
                <>
                  <Button size="sm" variant="ghost" onClick={cancel}>
                    Close
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => void submit(run.prompt)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Try again
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={cancel}>
                  Cancel
                </Button>
              )}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

/** What the last AI search asked for and did, above the filter chips it produced. */
export function AiSearchBanner({ result, edited, onEdit, onNew }: { result: AiSearchResult; edited: boolean; onEdit: () => void; onNew: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3 rounded-[8px] border border-line bg-panel-2 px-4 py-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-vermilion" />
      <div className="min-w-0 flex-1 basis-[260px]">
        <p className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{result.title}</p>
        <p className="mt-0.5 text-[13px] italic text-muted">&ldquo;{result.prompt}&rdquo;</p>
        {result.summary && <p className="mt-1.5 text-[13px] leading-relaxed text-body">{result.summary}</p>}
        {result.notes.map((n) => (
          <p key={n} className="mt-1 text-[12.5px] text-amber">
            Not covered: {n}
          </p>
        ))}
        {edited && <p className="mt-1 text-[12px] text-label">You have changed the filters since this search.</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Edit prompt
        </Button>
        <Button size="sm" variant="ghost" onClick={onNew}>
          <RotateCcw className="h-3.5 w-3.5" /> New search
        </Button>
      </div>
    </div>
  );
}
