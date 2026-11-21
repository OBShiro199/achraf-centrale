"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, Mail, MessageCircle, Pause, Phone, Play, Send } from "lucide-react";
import { useApp } from "@/components/app/context";
import { useDialer } from "@/components/app/dialer";
import { ChannelComposer } from "@/components/app/channel-composer";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Card, Empty, Pill, Settle, Skeleton } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { Hand } from "@/components/sketch/hand";
import { callFunction, createClient } from "@/lib/supabase/client";
import type { ThreadMessage } from "@/lib/types";
import { CHANNEL_LABEL, OUTCOME_LABEL, OUTCOME_TONE, type Channel, type Conversation, type Outcome } from "@/lib/unibox";
import { cn, duration, formatPhone, timeAgo } from "@/lib/utils";

interface ThreadDetail {
  id: string;
  subject: string;
  isRead: boolean;
  investor: { id: number; full_name: string; firm: string; email: string | null } | null;
  messages: ThreadMessage[];
}

interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  kind: "message" | "invite" | "inmail";
  body: string;
  sent_at: string;
}

interface CallRow {
  id: string;
  status: string;
  started_at: string;
  duration_seconds: number | null;
  outcome: Outcome | null;
  outcome_source: "ai" | "founder" | null;
  summary: string | null;
  transcript: string | null;
  notes: string | null;
  has_recording: boolean;
}

type Filter = "all" | Channel;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "email", label: "Email" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "phone", label: "Calls" },
];
const OUTCOMES = Object.keys(OUTCOME_LABEL) as Outcome[];

const ICON: Record<Channel, typeof Mail> = { email: Mail, linkedin: BriefcaseBusiness, whatsapp: MessageCircle, phone: Phone };

function cleanAddress(a: string) {
  return a.replace(/^.*<(.+)>.*$/, "$1");
}

/** Hide the quoted history email clients append, so each message reads cleanly. */
function stripQuote(text: string) {
  const cut = text.search(/\n\s*On .{5,120}wrote:\s*\n|\n-{2,}\s*Original Message|\n>/);
  return (cut > 0 ? text.slice(0, cut) : text).trim();
}

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function RowSkeleton({ wide }: { wide?: boolean }) {
  return (
    <li className="flex gap-3 border-b border-line-2 px-4 py-3">
      <Skeleton className="mt-0.5 h-7 w-7 rounded-[7px]" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className={cn("h-3", wide ? "w-40" : "w-28")} />
        <Skeleton className="h-3 w-full" />
      </div>
    </li>
  );
}

function OutcomePill({ outcome, source }: { outcome: Outcome | null; source?: "ai" | "founder" | null }) {
  if (!outcome) return null;
  return (
    <Pill tone={OUTCOME_TONE[outcome]} className="shrink-0">
      {OUTCOME_LABEL[outcome]}
      {source === "ai" && <span className="ml-1 opacity-60">AI</span>}
    </Pill>
  );
}

/** An email thread, read live from the founder's inbox. */
function EmailThread({ convo, onSent }: { convo: Conversation; onSent: () => void }) {
  const toast = useToast();
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await callFunction<{ thread: ThreadDetail }>("inbox", { action: "thread", thread_id: convo.external_id });
      setThread(r.thread);
      if (!r.thread.isRead || convo.unread) await callFunction("inbox", { action: "mark_read", thread_id: convo.external_id }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this thread");
    }
  }, [convo.external_id, convo.unread]);

  useEffect(() => {
    setThread(null);
    setError(null);
    setReply("");
    void load();
  }, [load]);

  async function send() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await callFunction("inbox", { action: "reply", thread_id: convo.external_id, body: reply });
      toast({ title: "Reply sent" });
      setReply("");
      await load();
      onSent();
    } catch (e) {
      toast({ title: "Could not send", body: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setSending(false);
    }
  }

  if (error) return <Empty title="Could not open this thread" body={error} />;
  if (!thread) return <MessagesSkeleton />;
  return (
    <>
      <div className="quiet-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <p className="text-[12.5px] text-label">{thread.subject}</p>
        {thread.messages.map((m) => {
          const mine = m.direction === "outbound";
          return (
            <Bubble key={m.id} mine={mine} who={mine ? "You" : cleanAddress(m.from)} at={m.createdAt}>
              {stripQuote(m.text) || "(no text)"}
            </Bubble>
          );
        })}
      </div>
      <Composer value={reply} onChange={setReply} onSend={() => void send()} sending={sending} placeholder={`Reply to ${(thread.investor?.full_name ?? convo.contact_name ?? "them").split(" ")[0]}`} />
    </>
  );
}

/** A LinkedIn or WhatsApp conversation, stored by Centrale as messages arrive. */
function ChatThread({ convo, onSent }: { convo: Conversation; onSent: () => void }) {
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const pendingInvite = convo.external_id.startsWith("invite:");

  const load = useCallback(async () => {
    const r = await callFunction<{ messages: ChatMessage[] }>("channels", { action: "messages", conversation_id: convo.id }).catch(() => ({ messages: [] }));
    setMessages(r.messages);
  }, [convo.id]);

  useEffect(() => {
    setMessages(null);
    setReply("");
    void load();
    const onReply = () => void load();
    window.addEventListener("centrale:reply", onReply);
    return () => window.removeEventListener("centrale:reply", onReply);
  }, [load]);

  async function send() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await callFunction("channels", { action: "reply", conversation_id: convo.id, text: reply });
      setReply("");
      await load();
      onSent();
    } catch (e) {
      toast({ title: "Could not send", body: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setSending(false);
    }
  }

  if (!messages) return <MessagesSkeleton />;
  return (
    <>
      <div className="quiet-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((m) => (
          <Bubble key={m.id} mine={m.direction === "outbound"} who={m.direction === "outbound" ? (m.kind === "invite" ? "Your invite note" : "You") : (convo.contact_name ?? "Them")} at={m.sent_at}>
            {m.body}
          </Bubble>
        ))}
        {pendingInvite && <p className="text-center text-[12.5px] text-label">Waiting for them to accept. Their reply shows here.</p>}
      </div>
      {!pendingInvite && (
        <Composer value={reply} onChange={setReply} onSend={() => void send()} sending={sending} placeholder={`Message on ${CHANNEL_LABEL[convo.channel]}`} />
      )}
    </>
  );
}

/** Every call to this number: outcome, summary, recording and transcript. */
function CallsThread({ convo }: { convo: Conversation }) {
  const toast = useToast();
  const { dial, busy } = useDialer();
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [playing, setPlaying] = useState<{ id: string; audio: HTMLAudioElement } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!convo.investor_id) return setCalls([]);
    const r = await callFunction<{ calls: CallRow[] }>("phone", { action: "calls", investor_id: convo.investor_id }).catch(() => ({ calls: [] }));
    setCalls(r.calls);
  }, [convo.investor_id]);

  useEffect(() => {
    setCalls(null);
    void load();
    if (convo.unread) void createClient().from("conversations").update({ unread: false }).eq("id", convo.id);
  }, [load, convo.id, convo.unread]);

  useEffect(() => () => playing?.audio.pause(), [playing]);

  async function play(id: string) {
    if (playing?.id === id) {
      playing.audio.pause();
      setPlaying(null);
      return;
    }
    playing?.audio.pause();
    try {
      const { url } = await callFunction<{ url: string }>("phone", { action: "recording", call_id: id });
      const audio = new Audio(url);
      audio.onended = () => setPlaying(null);
      await audio.play();
      setPlaying({ id, audio });
    } catch (e) {
      toast({ title: "Could not play the recording", body: e instanceof Error ? e.message : undefined, tone: "error" });
    }
  }

  if (!calls) return <MessagesSkeleton />;
  return (
    <div className="quiet-scroll flex-1 space-y-3 overflow-y-auto px-5 py-5">
      {convo.investor_id && (
        <Button size="sm" onClick={() => dial(convo.investor_id!)} disabled={busy}>
          <Phone className="h-3.5 w-3.5" /> Call again
        </Button>
      )}
      {calls.length === 0 && <p className="text-[13px] text-muted">No calls yet.</p>}
      {calls.map((c) => (
        <div key={c.id} className="rounded-[8px] border border-line bg-panel px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="font-medium text-ink">{when(c.started_at)}</span>
            <span className="text-label">
              {c.status === "completed" ? duration(c.duration_seconds) : c.status === "no_answer" ? "No answer" : c.status === "busy" ? "Busy" : c.status === "failed" ? "Did not connect" : "In progress"}
            </span>
            <OutcomePill outcome={c.outcome} source={c.outcome_source} />
            {c.has_recording && (
              <button onClick={() => void play(c.id)} className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-ink hover:underline">
                {playing?.id === c.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {playing?.id === c.id ? "Pause" : "Recording"}
              </button>
            )}
          </div>
          {c.summary && <p className="mt-2 text-[13.5px] leading-relaxed text-body">{c.summary}</p>}
          {c.notes && <p className="mt-1.5 text-[13px] text-muted">Your notes: {c.notes}</p>}
          {c.transcript && (
            <>
              <button onClick={() => setOpen(open === c.id ? null : c.id)} className="mt-2 text-[12.5px] text-label hover:text-ink">
                {open === c.id ? "Hide transcript" : "Show transcript"}
              </button>
              {open === c.id && <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-body">{c.transcript}</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function Bubble({ mine, who, at, children }: { mine: boolean; who: string; at: string; children: React.ReactNode }) {
  return (
    <div className={cn("max-w-[640px] rounded-[8px] border px-4 py-3", mine ? "ml-auto border-line bg-panel-2" : "border-[#f0cfc6] bg-panel")}>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-[12px]">
        <span className={cn("font-medium", mine ? "text-burgundy" : "text-vermilion")}>{who}</span>
        <span className="text-label">{when(at)}</span>
      </div>
      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-body">{children}</p>
    </div>
  );
}

function Composer({ value, onChange, onSend, sending, placeholder }: { value: string; onChange: (v: string) => void; onSend: () => void; sending: boolean; placeholder: string }) {
  return (
    <div className="border-t border-line-2 p-4">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[90px]"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSend();
        }}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[12px] text-label">Cmd + Enter to send</span>
        <Button variant="primary" size="sm" onClick={onSend} disabled={sending || !value.trim()}>
          <Send className="h-3.5 w-3.5" /> {sending ? "Sending" : "Send"}
        </Button>
      </div>
    </div>
  );
}

function MessagesSkeleton() {
  return (
    <div className="flex-1 space-y-4 px-5 py-5" aria-hidden>
      <Skeleton className="h-20 w-[70%] rounded-[8px]" />
      <Skeleton className="ml-auto h-16 w-[60%] rounded-[8px]" />
      <Skeleton className="h-24 w-[75%] rounded-[8px]" />
    </div>
  );
}

function InboxView() {
  const { setUnread } = useApp();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { dial, busy } = useDialer();
  const selectedId = params.get("c");
  const legacyThread = params.get("thread");
  const [convos, setConvos] = useState<Conversation[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [composer, setComposer] = useState<{ channel: "linkedin" | "whatsapp" } | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("conversations")
      .select("*, investor:investors_achraf(full_name, firm)")
      .order("last_message_at", { ascending: false })
      .limit(300);
    const rows = (data ?? []) as Conversation[];
    setConvos(rows);
    setUnread(rows.filter((c) => c.unread).length);
  }, [setUnread]);

  useEffect(() => {
    void load();
    const onReply = () => void load();
    window.addEventListener("centrale:reply", onReply);
    return () => window.removeEventListener("centrale:reply", onReply);
  }, [load]);

  // Links from older reply emails point at an email thread id.
  useEffect(() => {
    if (!legacyThread || !convos) return;
    const match = convos.find((c) => c.channel === "email" && c.external_id === legacyThread);
    if (match) router.replace(`/dashboard/inbox?c=${match.id}`, { scroll: false });
  }, [legacyThread, convos, router]);

  const shown = useMemo(
    () => (convos ?? []).filter((c) => (filter === "all" || c.channel === filter) && (!outcome || c.outcome === outcome) && (!unreadOnly || c.unread)),
    [convos, filter, outcome, unreadOnly],
  );
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of convos ?? []) if (c.unread) out[c.channel] = (out[c.channel] ?? 0) + 1;
    return out;
  }, [convos]);
  const convo = convos?.find((c) => c.id === selectedId) ?? null;
  const name = (c: Conversation) => c.investor?.full_name ?? c.contact_name ?? (c.contact_handle ? cleanAddress(c.contact_handle) : "Unknown");

  const open = (id: string | null) => router.replace(id ? `/dashboard/inbox?c=${id}` : "/dashboard/inbox", { scroll: false });

  async function setTag(value: Outcome | "") {
    if (!convo) return;
    try {
      await callFunction("channels", { action: "tag", conversation_id: convo.id, outcome: value || null });
      setConvos((all) => all?.map((c) => (c.id === convo.id ? { ...c, outcome: value || null, outcome_source: value ? "founder" : null, outcome_reason: null } : c)) ?? null);
    } catch (e) {
      toast({ title: "Could not save", body: e instanceof Error ? e.message : undefined, tone: "error" });
    }
  }

  return (
    <div className="px-4 py-6 md:px-6">
      <Settle className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] tracking-[-0.04em]">Inbox</h2>
          <p className="mt-1 text-[14px] text-muted">Every reply from email, LinkedIn and WhatsApp, and every call, in one place. Claude tags where each one stands.</p>
        </div>
      </Settle>

      <Settle delay={60}>
        <Card className="grid min-h-[calc(100dvh-210px)] overflow-hidden md:grid-cols-[360px_1fr]">
          <div className={cn("flex min-w-0 flex-col border-line md:border-r", selectedId && "hidden md:flex")}>
            <div className="space-y-2 border-b border-line-2 p-3">
              <div className="quiet-scroll flex gap-1 overflow-x-auto" role="tablist">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    role="tab"
                    aria-selected={filter === f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12.5px]", filter === f.key ? "bg-ink text-ivory" : "text-muted hover:bg-black/[0.04] hover:text-ink")}
                  >
                    {f.label}
                    {f.key !== "all" && counts[f.key] ? <span className="ml-1 tabular opacity-70">{counts[f.key]}</span> : null}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Select value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome | "")} className="h-8 flex-1 text-[12.5px]" aria-label="Outcome">
                  <option value="">Any outcome</option>
                  {OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {OUTCOME_LABEL[o]}
                    </option>
                  ))}
                </Select>
                <label className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted">
                  <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="accent-[var(--color-burgundy)]" />
                  Unread
                </label>
              </div>
            </div>
            {!convos ? (
              <ul aria-hidden>
                {Array.from({ length: 7 }, (_, i) => (
                  <RowSkeleton key={i} wide={i % 3 === 0} />
                ))}
              </ul>
            ) : shown.length === 0 ? (
              <Empty
                title={convos.length ? "Nothing matches" : "No conversations yet"}
                body={convos.length ? "Try another filter." : "Email, message or call an investor from the Investors tab. Replies land here and we email you when they do."}
              />
            ) : (
              <ul className="quiet-scroll max-h-[calc(100dvh-300px)] overflow-y-auto">
                {shown.map((c, i) => {
                  const Icon = ICON[c.channel];
                  return (
                    <li key={c.id} className="settle" style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}>
                      <button
                        onClick={() => open(c.id)}
                        className={cn("flex w-full items-start gap-3 border-b border-line-2 px-4 py-3 text-left transition-colors", selectedId === c.id ? "bg-[#f4ede3]" : "hover:bg-black/[0.02]")}
                      >
                        <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-line bg-panel-2" title={CHANNEL_LABEL[c.channel]}>
                          <Icon className="h-3.5 w-3.5 text-ink" />
                          {c.unread && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-vermilion" />}
                        </span>
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={cn("truncate text-[13.5px] text-ink", c.unread && "font-semibold")}>{name(c)}</span>
                            <span className="shrink-0 text-[11.5px] text-label">{timeAgo(c.last_message_at)}</span>
                          </span>
                          {c.investor?.firm && <span className="mt-0.5 block truncate text-[11.5px] text-label">{c.investor.firm}</span>}
                          <span className="mt-0.5 flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">
                              {c.last_direction === "outbound" && "You: "}
                              {c.last_preview}
                            </span>
                            <OutcomePill outcome={c.outcome} />
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className={cn("flex min-w-0 flex-col", !selectedId && "hidden md:flex")}>
            {!convo ? (
              <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
                <Empty title={selectedId && convos ? "Conversation not found" : "Pick a conversation"} body="Replies show with the investor attached, on whichever channel they answered." />
                <Hand className="text-[20px]" tilt={-2}>
                  replies arrive in real time
                </Hand>
              </div>
            ) : (
              <div key={convo.id} className="settle flex min-h-0 flex-1 flex-col">
                <div className="flex flex-wrap items-center gap-3 border-b border-line-2 px-5 py-3">
                  <button className="rounded-[6px] p-1 text-label hover:bg-black/[0.04] md:hidden" onClick={() => open(null)} aria-label="Back">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink">{name(convo)}</p>
                    <p className="truncate text-[12.5px] text-label">
                      {CHANNEL_LABEL[convo.channel]}
                      {convo.investor?.firm ? `, ${convo.investor.firm}` : ""}
                      {convo.channel === "phone" && convo.contact_handle ? `, ${formatPhone(convo.contact_handle)}` : ""}
                    </p>
                  </div>
                  <Select value={convo.outcome ?? ""} onChange={(e) => void setTag(e.target.value as Outcome | "")} className="h-8 w-[150px] text-[12.5px]" aria-label="Where this stands">
                    <option value="">No tag</option>
                    {OUTCOMES.map((o) => (
                      <option key={o} value={o}>
                        {OUTCOME_LABEL[o]}
                      </option>
                    ))}
                  </Select>
                  {convo.investor_id && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => dial(convo.investor_id!)} disabled={busy} aria-label="Call">
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setComposer({ channel: convo.channel === "whatsapp" ? "whatsapp" : "linkedin" })} aria-label="Message on LinkedIn or WhatsApp">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                {convo.outcome_reason && (
                  <p className="border-b border-line-2 bg-panel-2 px-5 py-2 text-[12.5px] text-muted">
                    <span className="text-label">Claude: </span>
                    {convo.outcome_reason}
                  </p>
                )}
                {convo.channel === "email" ? (
                  <EmailThread convo={convo} onSent={() => void load()} />
                ) : convo.channel === "phone" ? (
                  <CallsThread convo={convo} />
                ) : (
                  <ChatThread convo={convo} onSent={() => void load()} />
                )}
              </div>
            )}
          </div>
        </Card>
      </Settle>

      <ChannelComposer
        investor={composer && convo?.investor_id ? { id: convo.investor_id, full_name: name(convo) } : null}
        channel={composer?.channel ?? "linkedin"}
        onClose={() => setComposer(null)}
        onSent={(id) => {
          void load();
          open(id);
        }}
      />
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense>
      <InboxView />
    </Suspense>
  );
}
