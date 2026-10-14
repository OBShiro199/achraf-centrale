"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import { OutreachResults } from "@/components/app/outreach-results";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Drawer, Empty, Pill, Settle, Skeleton } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { loadBoard, removeFromPipeline, saveCard, STAGES, stageLabel, type PipelineCard, type Stage } from "@/lib/pipeline";
import { cn, timeAgo } from "@/lib/utils";

function due(on: string | null) {
  if (!on) return null;
  const today = new Date().toISOString().slice(0, 10);
  const label = new Date(`${on}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return { label, overdue: on < today, today: on === today };
}

function Card({ card, onOpen }: { card: PipelineCard; onOpen: () => void }) {
  const d = due(card.next_step_on);
  const activity = card.last_reply_at ? `Replied ${timeAgo(card.last_reply_at)}` : card.last_sent_at ? `Emailed ${timeAgo(card.last_sent_at)}` : null;
  return (
    <button onClick={onOpen} className="w-full rounded-[8px] border border-line bg-panel p-3 text-left transition-colors hover:border-[#cdbfb2]">
      <div className="truncate text-[13.5px] font-medium text-ink">{card.full_name}</div>
      {card.firm && <div className="truncate text-[12.5px] text-muted">{card.firm}</div>}
      {card.next_step && (
        <div className="mt-2 flex items-start gap-1.5 text-[12.5px] text-ink">
          <CalendarClock className="mt-[2px] h-3.5 w-3.5 shrink-0 text-label" />
          <span className="min-w-0">
            {card.next_step}
            {d && <span className={cn("ml-1", d.overdue ? "text-pencil" : d.today ? "text-amber" : "text-label")}>{d.today ? "today" : d.label}</span>}
          </span>
        </div>
      )}
      {activity && <div className="mt-2 text-[11.5px] text-label">{activity}</div>}
    </button>
  );
}

function Editor({ card, onSaved, onClose }: { card: PipelineCard; onSaved: () => void; onClose: () => void }) {
  const toast = useToast();
  const [stage, setStage] = useState<Stage>(card.stage);
  const [nextStep, setNextStep] = useState(card.next_step ?? "");
  const [nextOn, setNextOn] = useState(card.next_step_on ?? "");
  const [note, setNote] = useState(card.note ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await saveCard(card.investor_id, { stage, next_step: nextStep.trim() || null, next_step_on: nextOn || null, note: note.trim() || null });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Could not save", body: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await removeFromPipeline(card.investor_id);
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Could not remove", body: err instanceof Error ? err.message : undefined, tone: "error" });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div className="pr-8">
        <h3 className="text-[19px] tracking-[-0.02em]">{card.full_name}</h3>
        <p className="mt-0.5 text-[13px] text-muted">{[card.title, card.firm].filter(Boolean).join(", ")}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.last_sent_at && <Pill>Emailed {timeAgo(card.last_sent_at)}</Pill>}
          {card.last_reply_at && <Pill tone="green">Replied {timeAgo(card.last_reply_at)}</Pill>}
        </div>
      </div>
      <Field label="Stage" hint="Emails and replies move investors forward on their own. Passed stays where you put it.">
        <Select value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <Field label="Next step">
          <Input value={nextStep} maxLength={200} placeholder="Send the data room" onChange={(e) => setNextStep(e.target.value)} />
        </Field>
        <Field label="By">
          <Input type="date" value={nextOn} onChange={(e) => setNextOn(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea value={note} maxLength={5000} rows={6} placeholder="What they asked, who else is in the room, cheque size" onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        {card.thread_id && (
          <ButtonLink href={`/dashboard/inbox?thread=${encodeURIComponent(card.thread_id)}`} size="sm">
            Open thread <ArrowUpRight className="h-3.5 w-3.5" />
          </ButtonLink>
        )}
        {!card.last_sent_at && (
          <Button size="sm" variant="danger" onClick={() => void remove()} disabled={busy}>
            Remove from pipeline
          </Button>
        )}
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const toast = useToast();
  const [cards, setCards] = useState<PipelineCard[] | null>(null);
  const [open, setOpen] = useState<PipelineCard | null>(null);

  const reload = useCallback(async () => {
    try {
      setCards(await loadBoard());
    } catch (err) {
      setCards([]);
      toast({ title: "Could not load your pipeline", body: err instanceof Error ? err.message : undefined, tone: "error" });
    }
  }, [toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const byStage = useMemo(() => {
    const m = new Map<Stage, PipelineCard[]>(STAGES.map((s) => [s.key, []]));
    for (const c of cards ?? []) m.get(c.stage)?.push(c);
    return m;
  }, [cards]);

  const active = (cards ?? []).filter((c) => c.stage !== "passed").length;
  const dueSoon = (cards ?? []).filter((c) => {
    const d = due(c.next_step_on);
    return d && (d.overdue || d.today);
  }).length;

  return (
    <div className="space-y-5 px-4 py-8 md:px-8">
      <Settle>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[26px] tracking-[-0.04em]">Pipeline</h2>
            <p className="mt-1 text-[13.5px] text-muted">
              {cards == null
                ? "Loading your raise"
                : `${active} investor${active === 1 ? "" : "s"} in play${dueSoon ? `, ${dueSoon} next step${dueSoon === 1 ? "" : "s"} due` : ""}`}
            </p>
          </div>
        </div>
      </Settle>

      {cards == null ? (
        <div className="flex gap-3 overflow-hidden">
          {STAGES.slice(0, 4).map((s) => (
            <Skeleton key={s.key} className="h-[220px] w-[240px] shrink-0 rounded-[10px]" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <Empty
          title="Your pipeline is empty"
          body="Investors you email show up here on their own. You can also add investors from the Investors page before you write to them."
          action={<ButtonLink href="/dashboard/investors" variant="primary" size="sm">Find investors</ButtonLink>}
        />
      ) : (
        <Settle delay={60}>
          <div className="quiet-scroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-3 md:-mx-8 md:px-8">
            {STAGES.map((s) => {
              const list = byStage.get(s.key) ?? [];
              return (
                <section key={s.key} aria-label={s.label} className="flex w-[240px] shrink-0 flex-col rounded-[10px] bg-panel-2 p-2">
                  <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
                    <span className="text-[12.5px] font-medium text-ink">{s.label}</span>
                    <span className="tabular text-[12px] text-label">{list.length}</span>
                  </header>
                  <div className="space-y-2">
                    {list.map((c) => (
                      <Card key={c.investor_id} card={c} onOpen={() => setOpen(c)} />
                    ))}
                    {!list.length && <p className="px-1.5 pb-2 text-[12px] text-faint">None yet</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </Settle>
      )}

      <Settle delay={120}>
        <OutreachResults />
      </Settle>

      <p className="text-[12.5px] text-label">
        Stages: {STAGES.map((s) => stageLabel(s.key)).join(", ")}. Read more in <Link href="/dashboard/docs#pipeline" className="underline">Docs</Link>.
      </p>

      <Drawer open={!!open} onClose={() => setOpen(null)}>
        {open && <Editor key={open.investor_id} card={open} onSaved={() => void reload()} onClose={() => setOpen(null)} />}
      </Drawer>
    </div>
  );
}
