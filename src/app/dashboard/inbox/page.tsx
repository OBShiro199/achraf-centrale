"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, RefreshCw, Send } from "lucide-react";
import { useApp } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Card, Empty, Loader, Settle, Skeleton } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { Hand } from "@/components/sketch/hand";
import { callFunction } from "@/lib/supabase/client";
import type { ThreadMessage, ThreadSummary } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

interface ThreadDetail {
  id: string;
  subject: string;
  isRead: boolean;
  investor: { id: string; full_name: string; firm: string; email: string } | null;
  messages: ThreadMessage[];
}

/** "Oliver Burt at Tally <oliver-tally@omail.sh>" -> "Oliver Burt at Tally". */
function senderName(from: string | null) {
  if (!from) return null;
  return from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] ?? from;
}

function cleanAddress(a: string) {
  return a.replace(/^.*<(.+)>.*$/, "$1");
}

/** Hide the quoted history email clients append, so each message reads cleanly. */
function stripQuote(text: string) {
  const cut = text.search(/\n\s*On .{5,120}wrote:\s*\n|\n-{2,}\s*Original Message|\n>/);
  return (cut > 0 ? text.slice(0, cut) : text).trim();
}

function InboxView() {
  const { inbox, setUnread } = useApp();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("thread");
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadThreads = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await callFunction<{ threads: ThreadSummary[] }>("inbox", { action: "threads" });
      setThreads(r.threads);
    } catch {
      setThreads((t) => t ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
    const id = setInterval(() => void loadThreads(), 20000);
    return () => clearInterval(id);
  }, [loadThreads]);

  useEffect(() => {
    if (!selected) return setThread(null);
    setLoadingThread(true);
    setReply("");
    callFunction<{ thread: ThreadDetail }>("inbox", { action: "thread", thread_id: selected })
      .then(async (r) => {
        setThread(r.thread);
        if (!r.thread.isRead) {
          await callFunction("inbox", { action: "mark_read", thread_id: selected }).catch(() => {});
          setThreads((all) => all?.map((t) => (t.id === selected ? { ...t, isRead: true } : t)) ?? null);
        }
      })
      .catch(() => setThread(null))
      .finally(() => setLoadingThread(false));
  }, [selected]);

  // The sidebar badge follows the thread list.
  useEffect(() => {
    if (threads) setUnread(threads.filter((t) => !t.isRead).length);
  }, [threads, setUnread]);

  async function send() {
    if (!thread || !reply.trim()) return;
    setSending(true);
    try {
      await callFunction("inbox", { action: "reply", thread_id: thread.id, body: reply });
      toast({ title: "Reply sent" });
      setReply("");
      const r = await callFunction<{ thread: ThreadDetail }>("inbox", { action: "thread", thread_id: thread.id });
      setThread(r.thread);
      void loadThreads();
    } catch (e) {
      toast({ title: "Could not send", body: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setSending(false);
    }
  }

  const open = (id: string | null) => router.replace(id ? `/dashboard/inbox?thread=${id}` : "/dashboard/inbox", { scroll: false });

  return (
    <div className="px-4 py-6 md:px-6">
      <Settle className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] tracking-[-0.04em]">Inbox</h2>
          <p className="mt-1 text-[14px] text-muted">
            Every investor thread for <span className="text-ink">{inbox?.address}</span>, in one place.
          </p>
        </div>
        <Button size="sm" onClick={() => void loadThreads()} disabled={refreshing}>
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Refresh
        </Button>
      </Settle>

      <Settle delay={60}>
        <Card className="grid min-h-[calc(100dvh-210px)] overflow-hidden md:grid-cols-[340px_1fr]">
          <div className={cn("border-line md:border-r", selected && "hidden md:block")}>
            {!threads ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : threads.length === 0 ? (
              <Empty title="No threads yet" body="Email an investor from the Investors tab. Their reply lands here and we email you when it does." />
            ) : (
              <ul className="quiet-scroll max-h-[calc(100dvh-212px)] overflow-y-auto">
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => open(t.id)}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-line-2 px-4 py-3 text-left transition-colors",
                        selected === t.id ? "bg-[#f4ede3]" : "hover:bg-black/[0.02]",
                      )}
                    >
                      <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", t.isRead ? "bg-transparent" : "bg-vermilion")} />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn("truncate text-[13.5px] text-ink", !t.isRead && "font-semibold")}>{t.investor?.full_name ?? senderName(t.sender) ?? "Unknown sender"}</span>
                          <span className="shrink-0 text-[11.5px] text-label">{timeAgo(t.lastMessageAt)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-muted">{t.subject}</span>
                        <span className="mt-0.5 block text-[11.5px] text-label">
                          {t.investor?.firm ? `${t.investor.firm}, ` : ""}
                          {t.messageCount} message{t.messageCount === 1 ? "" : "s"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={cn("flex min-w-0 flex-col", !selected && "hidden md:flex")}>
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
                <Empty title="Pick a thread" body="Replies show with the investor attached. Your own sent emails show as text only." />
                <Hand className="text-[20px]" tilt={-2}>
                  replies arrive in real time
                </Hand>
              </div>
            ) : loadingThread || !thread ? (
              <Loader label="Opening thread" />
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-line-2 px-5 py-3.5">
                  <button className="rounded-[6px] p-1 text-label hover:bg-black/[0.04] md:hidden" onClick={() => open(null)} aria-label="Back">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ink">{thread.subject}</p>
                    <p className="truncate text-[12.5px] text-label">
                      {thread.investor
                        ? `${thread.investor.full_name}, ${thread.investor.firm}`
                        : cleanAddress(thread.messages.find((m) => m.direction === "inbound")?.from ?? "") || "Not linked to an investor"}
                    </p>
                  </div>
                </div>
                <div className="quiet-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5">
                  {thread.messages.map((m) => {
                    const mine = m.direction === "outbound";
                    return (
                      <div key={m.id} className={cn("max-w-[640px] rounded-[8px] border px-4 py-3", mine ? "ml-auto border-line bg-panel-2" : "border-[#f0cfc6] bg-panel")}>
                        <div className="mb-2 flex items-baseline justify-between gap-3 text-[12px]">
                          <span className={cn("font-medium", mine ? "text-burgundy" : "text-vermilion")}>{mine ? "You" : cleanAddress(m.from)}</span>
                          <span className="text-label">{new Date(m.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-body">{stripQuote(m.text) || "(no text)"}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-line-2 p-4">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={thread.investor ? `Reply to ${thread.investor.full_name.split(" ")[0]}` : "Write a reply"}
                    className="min-h-[90px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
                    }}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[12px] text-label">Cmd + Enter to send</span>
                    <Button variant="primary" size="sm" onClick={() => void send()} disabled={sending || !reply.trim()}>
                      <Send className="h-3.5 w-3.5" /> {sending ? "Sending" : "Send reply"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      </Settle>
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
