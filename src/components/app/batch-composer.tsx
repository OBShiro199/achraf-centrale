"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Avatar, Modal, Pill, brandConfetti } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { callFunction } from "@/lib/supabase/client";
import { queueEmails } from "@/lib/outbox";
import type { DirectoryRow } from "@/lib/directory";
import { cn } from "@/lib/utils";
import { useApp } from "./context";

export const BATCH_LIMIT = 50;
const CONCURRENCY = 3;

type Draft = {
  row: DirectoryRow;
  state: "waiting" | "drafting" | "ready" | "failed" | "skipped";
  subject: string;
  body: string;
  note?: string;
  include: boolean;
};

const SPACING = [
  { value: 2, label: "2 minutes apart" },
  { value: 4, label: "4 minutes apart" },
  { value: 8, label: "8 minutes apart" },
  { value: 15, label: "15 minutes apart" },
];

/**
 * Drafts a first email for each selected investor (three at a time), lets the founder read and edit
 * each one, then queues them in the Outbox, spaced out so the inbox never sends in a burst.
 */
export function BatchComposer({ rows, open, onClose, onQueued }: { rows: DirectoryRow[]; open: boolean; onClose: () => void; onQueued: () => void }) {
  const { inbox } = useApp();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [active, setActive] = useState(0);
  const [spacing, setSpacing] = useState(4);
  const [queueing, setQueueing] = useState(false);
  const run = useRef(0);

  const patch = (id: string, p: Partial<Draft>) => setDrafts((d) => d.map((x) => (x.row.id === id ? { ...x, ...p } : x)));

  async function draftOne(id: string, runId: number) {
    patch(id, { state: "drafting", note: undefined });
    try {
      const d = await callFunction<{ subject: string; body: string }>("draft-email", { investor_id: id });
      if (run.current === runId) patch(id, { state: "ready", subject: d.subject, body: d.body });
    } catch (err) {
      if (run.current === runId) patch(id, { state: "failed", note: err instanceof Error ? err.message : "Could not draft", include: false });
    }
  }

  useEffect(() => {
    if (!open) return;
    const runId = ++run.current;
    const list: Draft[] = rows.slice(0, BATCH_LIMIT).map((row) => {
      const skip = row.contacted ? "Already contacted" : row.queued ? "Already queued" : null;
      return { row, state: skip ? "skipped" : "waiting", subject: "", body: "", note: skip ?? undefined, include: !skip };
    });
    setDrafts(list);
    setActive(Math.max(0, list.findIndex((d) => d.state !== "skipped")));

    const queue = list.filter((d) => d.state === "waiting").map((d) => d.row.id);
    const worker = async () => {
      while (queue.length && run.current === runId) await draftOne(queue.shift()!, runId);
    };
    void Promise.all(Array.from({ length: CONCURRENCY }, worker));
    // Drafting runs once per open; editing never restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) run.current++;
  }, [open]);

  const ready = drafts.filter((d) => d.state === "ready" && d.include);
  const pending = drafts.filter((d) => d.state === "waiting" || d.state === "drafting").length;
  const current = drafts[active];

  async function queue() {
    setQueueing(true);
    try {
      const rows = await queueEmails(
        ready.map((d) => ({ investor_id: d.row.id, subject: d.subject, body: d.body })),
        { spacingMinutes: spacing },
      );
      void brandConfetti(0.6);
      toast({
        title: `${rows.length} email${rows.length === 1 ? "" : "s"} queued`,
        body: `The first goes out within a minute, then one every ${spacing} minutes. Follow them in your Outbox.`,
      });
      onQueued();
      onClose();
    } catch (err) {
      toast({ title: "Could not queue", body: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setQueueing(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Email ${drafts.length} investor${drafts.length === 1 ? "" : "s"}`} width={980}>
      <div className="grid min-h-[460px] md:grid-cols-[300px_1fr]">
        <div className="quiet-scroll max-h-[520px] overflow-y-auto border-b border-line-2 md:border-b-0 md:border-r">
          {drafts.map((d, i) => (
            <button
              key={d.row.id}
              onClick={() => setActive(i)}
              className={cn(
                "flex w-full items-center gap-2.5 border-b border-line-2 px-4 py-2.5 text-left transition-colors",
                i === active ? "bg-[#f7f0e6]" : "hover:bg-black/[0.02]",
                d.state === "skipped" && "opacity-55",
              )}
            >
              <Avatar name={d.row.full_name} className="h-7 w-7 shrink-0 text-[10.5px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{d.row.full_name}</span>
                <span className="block truncate text-[12px] text-label">{d.note ?? d.row.firm}</span>
              </span>
              {d.state === "drafting" || d.state === "waiting" ? (
                <RefreshCw className={cn("h-3.5 w-3.5 text-label", d.state === "drafting" && "animate-spin")} />
              ) : d.state === "ready" ? (
                <span
                  role="checkbox"
                  aria-checked={d.include}
                  onClick={(e) => {
                    e.stopPropagation();
                    patch(d.row.id, { include: !d.include });
                  }}
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-[4px] border",
                    d.include ? "border-burgundy bg-burgundy text-ivory" : "border-[#d5c8ba] bg-panel",
                  )}
                >
                  {d.include && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              ) : d.state === "failed" ? (
                <AlertCircle className="h-3.5 w-3.5 text-pencil" />
              ) : (
                <Pill>Skip</Pill>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col p-5">
          {current ? (
            current.state === "ready" ? (
              <>
                <p className="text-[12.5px] text-label">
                  To {current.row.full_name}, {current.row.title ?? "investor"} at {current.row.firm}
                </p>
                <Input
                  className="mt-3"
                  value={current.subject}
                  onChange={(e) => patch(current.row.id, { subject: e.target.value })}
                  aria-label="Subject"
                />
                <Textarea
                  className="mt-2 min-h-[260px] flex-1"
                  value={current.body}
                  onChange={(e) => patch(current.row.id, { body: e.target.value })}
                  aria-label="Message"
                />
                <div className="mt-2 flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => void draftOne(current.row.id, run.current)}>
                    <RefreshCw className="h-3.5 w-3.5" /> Redraft
                  </Button>
                  <label className="flex items-center gap-2 text-[12.5px] text-muted">
                    <input
                      type="checkbox"
                      checked={current.include}
                      onChange={() => patch(current.row.id, { include: !current.include })}
                      className="accent-burgundy"
                    />
                    Include in this batch
                  </label>
                </div>
              </>
            ) : current.state === "failed" ? (
              <div className="m-auto max-w-[320px] text-center">
                <p className="text-[14px] text-ink">Could not draft this one</p>
                <p className="mt-1 text-[12.5px] text-label">{current.note}</p>
                <Button size="sm" className="mt-3" onClick={() => void draftOne(current.row.id, run.current)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </Button>
              </div>
            ) : current.state === "skipped" ? (
              <p className="m-auto max-w-[320px] text-center text-[13.5px] text-label">
                {current.note}. Follow-ups for people you have emailed are drafted automatically after a few days without a reply.
              </p>
            ) : (
              <div className="m-auto text-center">
                <RefreshCw className="mx-auto h-4 w-4 animate-spin text-label" />
                <p className="mt-2 text-[13.5px] text-muted">Drafting from your profile and {current.row.full_name.split(" ")[0]}&apos;s focus</p>
              </div>
            )
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 px-5 py-3">
        <p className="max-w-[460px] text-[12px] text-label">
          {inbox
            ? "Queued emails send from your inbox, up to 20 new emails a day. Anything over rolls to the next morning."
            : "Your inbox is not set up yet. Emails will wait in the Outbox until it is."}
          {pending > 0 && ` Drafting ${pending} more.`}
        </p>
        <div className="flex items-center gap-2">
          <Select value={spacing} onChange={(e) => setSpacing(Number(e.target.value))} className="h-8 w-[170px] text-[13px]" aria-label="Spacing">
            {SPACING.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button variant="primary" size="sm" disabled={!ready.length || queueing} onClick={() => void queue()}>
            <Send className="h-3.5 w-3.5" /> {queueing ? "Queueing" : `Queue ${ready.length} email${ready.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
