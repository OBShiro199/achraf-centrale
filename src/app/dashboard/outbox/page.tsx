"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Clock, Pencil, Send, X } from "lucide-react";
import { useApp } from "@/components/app/context";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card, CardHeader, Empty, Modal, Pill, Settle, Skeleton } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { HISTORY_SELECT, SCHEDULED_SELECT, type ScheduledEmailRow } from "@/lib/outbox";
import type { ScheduledEmail } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

type HistoryStatus = "sent" | "failed" | "cancelled";
type History = Record<HistoryStatus, { rows: ScheduledEmailRow[]; count: number }>;
type Patch = Partial<Pick<ScheduledEmail, "subject" | "body" | "status" | "send_after">>;

const HISTORY_TABS: { key: HistoryStatus; label: string }[] = [
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
];
const HISTORY_LIMIT = 100;
const DAILY_CAP = 20;

const clock = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function stamp(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Calendar days from `a` to `b` in local time. */
function daysBetween(a: Date, b: Date) {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}

/** "in 12 minutes", "in 2 hours", "tomorrow at 08:14", "Friday at 09:30". */
function sendsIn(iso: string, now: number) {
  const at = new Date(iso);
  const ms = at.getTime() - now;
  if (ms <= 0) return "due now";
  if (ms < 60_000) return "in under a minute";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${min} minute${min === 1 ? "" : "s"}`;
  const days = daysBetween(new Date(now), at);
  if (days === 0) {
    const h = Math.round(min / 60);
    return h <= 3 ? `in ${h} hour${h === 1 ? "" : "s"}` : `today at ${clock(at)}`;
  }
  if (days === 1) return `tomorrow at ${clock(at)}`;
  if (days < 7) return `${at.toLocaleDateString("en-GB", { weekday: "long" })} at ${clock(at)}`;
  return `${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${clock(at)}`;
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function KindPill({ kind }: { kind: ScheduledEmail["kind"] }) {
  return kind === "follow_up" ? <Pill tone="burgundy">Follow-up</Pill> : <Pill>First email</Pill>;
}

function Recipient({ row }: { row: ScheduledEmailRow }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="truncate text-[13.5px] font-medium text-ink">{row.investor?.full_name ?? "Removed investor"}</span>
      {row.investor?.firm && <span className="truncate text-[12.5px] text-label">{row.investor.firm}</span>}
      <KindPill kind={row.kind} />
    </span>
  );
}

function Stat({ label, value, note }: { label: string; value: number | null; note: string }) {
  return (
    <Card className="min-w-0 px-4 py-3 md:px-5 md:py-4">
      <p className="truncate text-[12.5px] text-label">{label}</p>
      {value == null ? (
        <Skeleton className="mt-1 h-7 w-10 md:h-8 md:w-14" />
      ) : (
        <p className="display tabular settle mt-1 text-[26px] leading-none tracking-[-0.045em] text-display md:text-[32px]">{value}</p>
      )}
      <p className="mt-2 truncate text-[12px] text-label">
        {value == null ? <Skeleton className="inline-block h-[0.8em] w-20 align-middle" /> : note}
      </p>
    </Card>
  );
}

/** Same box model as a scheduled row. */
function RowSkeleton({ i }: { i: number }) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3 border-b border-line-2 px-4 py-3 md:grid-cols-[auto_1fr_auto] md:px-5">
      <span className="mt-1 h-3.5 w-3.5" />
      <span className="min-w-0 leading-tight">
        <span className="block text-[13.5px]">
          <Skeleton className="inline-block h-[0.8em] align-middle" style={{ width: 110 + (i % 3) * 24 }} />
        </span>
        <span className="mt-1 block text-[13px]">
          <Skeleton className="inline-block h-[0.8em] align-middle" style={{ width: 180 + (i % 2) * 60 }} />
        </span>
      </span>
      <span className="col-start-2 mt-2 flex items-center gap-2 md:col-start-3 md:row-start-1 md:mt-0">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-[150px] rounded-[6px]" />
      </span>
    </li>
  );
}

export default function OutboxPage() {
  const { profile, startup, inbox } = useApp();
  const toast = useToast();
  const [scheduled, setScheduled] = useState<ScheduledEmailRow[] | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [sentWeek, setSentWeek] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<HistoryStatus>("sent");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<{ ids: string[]; open: boolean }>({ ids: [], open: false });
  const [editing, setEditing] = useState<ScheduledEmailRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState({ subject: "", body: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [queue, week, ...past] = await Promise.all([
      supabase.from("scheduled_emails").select(SCHEDULED_SELECT).in("status", ["queued", "sending"]).order("send_after").limit(1000),
      supabase.from("scheduled_emails").select("id", { count: "exact", head: true }).eq("status", "sent").gte("updated_at", weekAgo),
      ...HISTORY_TABS.map((t) =>
        supabase
          .from("scheduled_emails")
          .select(HISTORY_SELECT, { count: "exact" })
          .eq("status", t.key)
          .order("updated_at", { ascending: false })
          .limit(HISTORY_LIMIT),
      ),
    ]);
    const error = queue.error ?? week.error ?? past.find((p) => p.error)?.error;
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setNow(Date.now());
    setScheduled((queue.data ?? []) as ScheduledEmailRow[]);
    setSentWeek(week.count ?? 0);
    setHistory(
      Object.fromEntries(
        HISTORY_TABS.map((t, i) => [t.key, { rows: (past[i].data ?? []) as ScheduledEmailRow[], count: past[i].count ?? 0 }]),
      ) as History,
    );
  }, []);

  // Live updates: the worker claims, sends and requeues rows, and drafts follow-ups.
  useEffect(() => {
    void load();
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The worker touches many rows per run, so batch the refetch.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 400);
    };

    // Realtime applies RLS with the socket's token, so attach the session before joining.
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) void supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`outbox:${profile.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_emails", filter: `owner_id=eq.${profile.id}` }, refresh)
        .subscribe();
    });

    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const poll = setInterval(() => void load(), 120_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(tick);
      clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [profile.id, load]);

  const queued = useMemo(() => scheduled?.filter((r) => r.status === "queued") ?? [], [scheduled]);
  const selected = queued.filter((r) => picked.has(r.id)).map((r) => r.id);
  const allPicked = queued.length > 0 && selected.length === queued.length;

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const today = scheduled?.filter((r) => r.status === "sending" || new Date(r.send_after) <= endOfToday).length ?? null;
  const nothingYet = scheduled?.length === 0 && !!history && HISTORY_TABS.every((t) => history[t.key].count === 0);
  const editingLive = editing ? scheduled?.find((r) => r.id === editing.id) : undefined;
  const editLocked = !!editing && editingLive?.status !== "queued";

  const mark = (ids: string[], on: boolean) =>
    setBusy((b) => {
      const next = new Set(b);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  /** Updates rows that are still queued. Returns how many changed; the rest already started sending. */
  async function patch(ids: string[], values: Patch) {
    const { data, error } = await createClient().from("scheduled_emails").update(values).in("id", ids).eq("status", "queued").select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length;
  }

  async function sendNow(row: ScheduledEmailRow) {
    mark([row.id], true);
    const at = new Date().toISOString();
    try {
      const n = await patch([row.id], { send_after: at });
      if (!n) return toast({ title: "Already on its way", body: "This email started sending before your change." });
      setScheduled(
        (all) =>
          all &&
          [...all.map((r) => (r.id === row.id ? { ...r, send_after: at } : r))].sort((a, b) => a.send_after.localeCompare(b.send_after)),
      );
      toast({ title: "Sending now", body: `Goes out within a minute, unless today's ${DAILY_CAP} are already used.` });
    } catch (e) {
      toast({ title: "Could not send now", body: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      mark([row.id], false);
    }
  }

  async function cancel(ids: string[]) {
    setConfirm((c) => ({ ...c, open: false }));
    mark(ids, true);
    try {
      const n = await patch(ids, { status: "cancelled" });
      setScheduled((all) => all && all.filter((r) => !(ids.includes(r.id) && r.status === "queued")));
      setPicked(new Set());
      if (n < ids.length)
        toast({ title: `${plural(n, "email")} cancelled`, body: `${plural(ids.length - n, "email")} had already started sending.` });
      else toast({ title: n === 1 ? "Email cancelled" : `${n} emails cancelled` });
      void load();
    } catch (e) {
      toast({ title: "Could not cancel", body: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      mark(ids, false);
    }
  }

  function openEdit(row: ScheduledEmailRow) {
    setEditing(row);
    setDraft({ subject: row.subject, body: row.body });
    setEditOpen(true);
  }

  const closeEdit = useCallback(() => setEditOpen(false), []);
  const closeConfirm = useCallback(() => setConfirm((c) => ({ ...c, open: false })), []);

  async function saveEdit() {
    if (!editing || !draft.subject.trim() || !draft.body.trim()) return;
    setSaving(true);
    try {
      const values = { subject: draft.subject.trim(), body: draft.body.trim() };
      const n = await patch([editing.id], values);
      if (!n) return toast({ title: "Not saved", body: "This email started sending before your change.", tone: "error" });
      setScheduled((all) => all && all.map((r) => (r.id === editing.id ? { ...r, ...values } : r)));
      setEditOpen(false);
      toast({ title: "Email updated" });
    } catch (e) {
      toast({ title: "Could not save", body: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const days = startup.follow_up_days;
  const shown = history?.[tab];

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 px-4 py-8 md:px-8">
      <Settle>
        <h2 className="text-[26px] tracking-[-0.04em]">Outbox</h2>
        <p className="mt-1 max-w-[620px] text-[14px] text-muted">
          Sends up to {DAILY_CAP} new emails a day from your inbox, spaced out.{" "}
          {startup.auto_follow_up ? `Follow-ups go after ${plural(days, "day")} without a reply.` : "Automatic follow-ups are off."}{" "}
          <Link href="/dashboard/settings" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
            Change in Settings
          </Link>
        </p>
        {!inbox && <p className="mt-2 text-[13px] text-amber">Nothing sends until your sending inbox is set up.</p>}
      </Settle>

      <Settle delay={60} className="grid grid-cols-3 gap-3">
        <Stat label="Queued" value={scheduled ? queued.length : null} note="Waiting to send" />
        <Stat
          label="Sending today"
          value={today}
          note={(today ?? 0) > DAILY_CAP ? `Over ${DAILY_CAP} roll to tomorrow` : "Before midnight"}
        />
        <Stat label="Sent" value={sentWeek} note="Last 7 days" />
      </Settle>

      <Settle delay={120}>
        <Card>
          <CardHeader title="Scheduled" sub="Edit, send now or cancel anything that has not gone out yet." />
          {loadError && !scheduled ? (
            <Empty
              title="Could not load your outbox"
              body={loadError}
              action={
                <Button size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              }
            />
          ) : !scheduled ? (
            <ul aria-hidden>
              {Array.from({ length: 4 }, (_, i) => (
                <RowSkeleton key={i} i={i} />
              ))}
            </ul>
          ) : nothingYet ? (
            <Empty
              title="Nothing queued yet"
              body="Select investors in the database and choose Queue emails. They go out through the day, and follow-ups show here before they send."
              action={
                <ButtonLink href="/dashboard/investors" size="sm">
                  Open investors
                </ButtonLink>
              }
            />
          ) : scheduled.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13.5px] text-muted">
              Nothing waiting to send. Select investors in the database and choose Queue emails.
            </p>
          ) : (
            <>
              {queued.length > 0 && (
                <div className="flex min-h-[46px] flex-wrap items-center justify-between gap-2 border-b border-line-2 px-4 py-2 md:px-5">
                  <label className="flex items-center gap-3 text-[12.5px] text-muted">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-burgundy"
                      checked={allPicked}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(queued.map((r) => r.id)))}
                    />
                    {selected.length ? `${selected.length} selected` : "Select all queued"}
                  </label>
                  {selected.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
                        Clear
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setConfirm({ ids: selected, open: true })}>
                        Cancel {plural(selected.length, "email")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              <ul className="quiet-scroll max-h-[640px] overflow-y-auto">
                {scheduled.map((r, i) => {
                  const sending = r.status === "sending";
                  const working = busy.has(r.id);
                  return (
                    <li
                      key={r.id}
                      className={cn(
                        "settle grid grid-cols-[auto_1fr] gap-x-3 border-b border-line-2 px-4 py-3 last:border-b-0 md:grid-cols-[auto_1fr_auto] md:px-5",
                        picked.has(r.id) && !sending && "bg-panel-2",
                      )}
                      style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
                    >
                      {sending ? (
                        <span className="mt-1 h-3.5 w-3.5" />
                      ) : (
                        <input
                          type="checkbox"
                          aria-label={`Select email to ${r.investor?.full_name ?? "investor"}`}
                          className="mt-1 h-3.5 w-3.5 accent-burgundy"
                          checked={picked.has(r.id)}
                          onChange={() =>
                            setPicked((p) => {
                              const next = new Set(p);
                              if (next.has(r.id)) next.delete(r.id);
                              else next.add(r.id);
                              return next;
                            })
                          }
                        />
                      )}
                      <div className="min-w-0">
                        <Recipient row={r} />
                        <p className="mt-0.5 truncate text-[13px] text-muted">{r.subject}</p>
                        {r.last_error && <p className="mt-1 text-[12px] text-amber">{r.last_error}</p>}
                      </div>
                      <div className="col-start-2 mt-2 flex flex-wrap items-center gap-1 md:col-start-3 md:row-start-1 md:mt-0 md:justify-end">
                        {sending ? (
                          <Pill tone="amber">Sending now</Pill>
                        ) : (
                          <>
                            <span title={stamp(r.send_after)} className="mr-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                              <Clock className="h-3.5 w-3.5 text-label" /> {sendsIn(r.send_after, now)}
                            </span>
                            <Button size="sm" variant="ghost" className="px-2" onClick={() => openEdit(r)} disabled={working}>
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </Button>
                            <Button size="sm" variant="ghost" className="px-2" onClick={() => void sendNow(r)} disabled={working}>
                              <Send className="h-3.5 w-3.5" /> Send now
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="px-2"
                              onClick={() => setConfirm({ ids: [r.id], open: true })}
                              disabled={working}
                            >
                              <X className="h-3.5 w-3.5" /> Cancel
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      </Settle>

      {history && !nothingYet && (
        <Settle delay={180}>
          <Card>
            <CardHeader
              title="History"
              action={
                <div role="tablist" aria-label="History" className="inline-flex shrink-0 rounded-[6px] border border-line bg-panel-2 p-0.5">
                  {HISTORY_TABS.map((t) => {
                    const on = tab === t.key;
                    return (
                      <button
                        key={t.key}
                        role="tab"
                        aria-selected={on}
                        onClick={() => setTab(t.key)}
                        className={cn(
                          "flex h-7 items-center gap-1.5 rounded-[4px] border px-2.5 text-[12.5px] transition-colors",
                          on
                            ? "border-line bg-panel text-ink shadow-[0_1px_0_rgba(57,28,37,0.04)]"
                            : "border-transparent text-muted hover:text-ink",
                        )}
                      >
                        {t.label}
                        <span className="tabular text-label">{history[t.key].count}</span>
                      </button>
                    );
                  })}
                </div>
              }
            />
            {!shown?.rows.length ? (
              <p className="px-5 py-8 text-center text-[13.5px] text-muted">
                {tab === "sent" ? "Nothing sent from the Outbox yet." : tab === "failed" ? "No failed emails." : "No cancelled emails."}
              </p>
            ) : (
              <ul className="quiet-scroll max-h-[560px] overflow-y-auto">
                {shown.rows.map((r) => {
                  const thread = r.outreach?.openmail_thread_id ?? r.thread_id;
                  return (
                    <li key={r.id} className="flex items-start gap-3 border-b border-line-2 px-4 py-3 last:border-b-0 md:px-5">
                      <div className="min-w-0 flex-1">
                        <Recipient row={r} />
                        <p className="mt-0.5 truncate text-[13px] text-muted">{r.subject}</p>
                        {r.last_error && tab !== "sent" && (
                          <p className={cn("mt-1 text-[12px]", tab === "failed" ? "text-pencil" : "text-label")}>{r.last_error}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                        <span title={stamp(r.updated_at)} className="text-[12px] text-label">
                          {timeAgo(r.updated_at)}
                        </span>
                        {tab === "sent" && thread && (
                          <Link
                            href={`/dashboard/inbox?thread=${encodeURIComponent(thread)}`}
                            className="inline-flex items-center gap-1 text-[12.5px] text-ink hover:text-vermilion"
                          >
                            Open thread <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {!!shown && shown.count > HISTORY_LIMIT && (
              <p className="border-t border-line-2 px-5 py-2.5 text-[12px] text-label">
                Showing the latest {HISTORY_LIMIT} of {shown.count}.
              </p>
            )}
          </Card>
        </Settle>
      )}

      <Modal open={editOpen} onClose={closeEdit} title={editing ? `Email to ${editing.investor?.full_name ?? "investor"}` : "Edit email"}>
        <div className="space-y-4 p-5">
          {editLocked && (
            <p className="rounded-[6px] border border-line bg-amber-soft px-3 py-2 text-[13px] text-amber">
              This email has left the queue, so changes can no longer be saved.
            </p>
          )}
          <Field label="Subject">
            <Input value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} />
          </Field>
          <Field label="Body">
            <Textarea value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} className="min-h-[260px]" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 px-5 py-3">
          <span className="text-[12px] text-label">
            {editingLive?.status === "queued" ? `Sends ${sendsIn(editingLive.send_after, now)}` : editing?.investor?.email}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={closeEdit}>
              Discard
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void saveEdit()}
              disabled={saving || editLocked || !draft.subject.trim() || !draft.body.trim()}
            >
              {saving ? "Saving" : "Save changes"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirm.open}
        onClose={closeConfirm}
        title={confirm.ids.length > 1 ? `Cancel ${confirm.ids.length} emails?` : "Cancel this email?"}
        width={440}
      >
        <p className="p-5 text-[13.5px] leading-relaxed text-muted">
          Cancelled emails move to History and will not send. To send one later, queue it again from Investors.
        </p>
        <div className="flex justify-end gap-2 border-t border-line-2 px-5 py-3">
          <Button size="sm" variant="ghost" onClick={closeConfirm}>
            Keep
          </Button>
          <Button size="sm" variant="danger" onClick={() => void cancel(confirm.ids)}>
            {confirm.ids.length > 1 ? `Cancel ${confirm.ids.length} emails` : "Cancel email"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
