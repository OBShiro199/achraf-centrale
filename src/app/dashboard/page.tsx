"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { useApp } from "@/components/app/context";
import { ComposeModal } from "@/components/app/compose";
import { Button, ButtonLink } from "@/components/ui/button";
import { Avatar, Card, CardHeader, Empty, Pill, Settle, Skeleton } from "@/components/ui/kit";
import { ScribbleTick, ScribbleUnderline } from "@/components/sketch/draw";
import { RoughStrokes, type Stroke } from "@/components/sketch/rough";
import { BrandMark } from "@/components/landing/logo";
import { callFunction } from "@/lib/supabase/client";
import { useInvestors, useStats, type InvestorRow } from "@/lib/data";
import { label, STAGES } from "@/lib/taxonomy";
import type { ThreadSummary } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

function plural(n: number, one: string, tail: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many} ${tail}`;
}

function Stat({ label: l, value, note, loading }: { label: string; value: string; note: string; loading: boolean }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-[12.5px] text-label">{l}</p>
      {loading ? (
        <Skeleton className="mt-1 h-8 w-14" />
      ) : (
        <p className="display tabular settle mt-1 text-[32px] leading-none tracking-[-0.045em] text-display">{value}</p>
      )}
      <p className="mt-2 text-[12px] text-label">{loading ? <Skeleton className="inline-block h-[0.8em] w-28 align-middle" /> : note}</p>
    </Card>
  );
}

function ActivityChart({ days }: { days: { d: Date; sent: number; replies: number }[] }) {
  const max = Math.max(4, ...days.map((x) => x.sent));
  const W = 640;
  const H = 150;
  const bw = W / days.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full">
      <RoughStrokes
        memoKey={days.map((d) => `${d.sent}-${d.replies}`).join(",")}
        build={(g) => {
          const s: Stroke[] = [{ drawable: g.line(0, H, W, H, { seed: 1, roughness: 0.6, stroke: "#c4b9b0", strokeWidth: 1 }), immediate: true, duration: 0.5 }];
          days.forEach((x, i) => {
            const cx = i * bw + bw / 2;
            if (x.sent) {
              const h = (x.sent / max) * (H - 12);
              s.push({
                drawable: g.rectangle(cx - 12, H - h, 14, h, { seed: 10 + i, roughness: 0.9, stroke: "#6f5f62", strokeWidth: 1, fill: "#9a8d88", fillStyle: "hachure", hachureGap: 3.5, fillWeight: 0.7 }),
                immediate: true,
                delay: 0.1 + i * 0.04,
                duration: 0.6,
              });
            }
            if (x.replies) {
              const h = (x.replies / max) * (H - 12);
              s.push({
                drawable: g.rectangle(cx + 4, H - h, 9, h, { seed: 40 + i, roughness: 0.9, stroke: "#d94a38", strokeWidth: 1.1, fill: "#d94a38", fillStyle: "cross-hatch", hachureGap: 3, fillWeight: 0.6 }),
                immediate: true,
                delay: 0.3 + i * 0.04,
                duration: 0.5,
              });
            }
          });
          return s;
        }}
      />
      {days.map((x, i) =>
        i % 2 === 0 ? (
          <text key={i} x={i * bw + bw / 2} y={H + 16} fontSize={10.5} textAnchor="middle" fill="#9a8d88">
            {x.d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export default function HomePage() {
  const { profile, startup, signedUpAt, inbox, initialStats } = useApp();
  const { stats: liveStats, messages, reload } = useStats();
  const stats = liveStats ?? initialStats;
  const { rows, reload: reloadInvestors } = useInvestors();
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [composeFor, setComposeFor] = useState<InvestorRow | null>(null);

  useEffect(() => {
    callFunction<{ threads: ThreadSummary[] }>("inbox", { action: "threads" })
      .then((r) => setThreads(r.threads))
      .catch(() => setThreads([]));
  }, []);

  const days = useMemo(() => {
    const out: { d: Date; sent: number; replies: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      out.push({ d, sent: 0, replies: 0 });
    }
    for (const m of messages ?? []) {
      const t = new Date(m.sent_at);
      t.setHours(0, 0, 0, 0);
      const slot = out.find((x) => x.d.getTime() === t.getTime());
      if (slot) slot[m.direction === "outbound" ? "sent" : "replies"]++;
    }
    return out;
  }, [messages]);

  const firstSent = useMemo(() => {
    const outbound = (messages ?? []).filter((m) => m.direction === "outbound");
    if (!outbound.length) return null;
    const first = outbound.reduce((a, b) => (a.sent_at < b.sent_at ? a : b));
    return Math.max(1, Math.round((new Date(first.sent_at).getTime() - new Date(signedUpAt).getTime()) / 60000));
  }, [messages, signedUpAt]);

  const top = useMemo(() => (rows ?? []).slice().sort((a, b) => b.score - a.score).slice(0, 5), [rows]);
  const loading = !stats;
  const saved = stats?.investors_saved ?? 0;

  const steps = [
    { done: startup.analysis_status === "done", label: "Profile written", note: "From your website", href: "/dashboard/profile" },
    { done: Boolean(inbox), label: "Inbox ready", note: inbox ? "Sending live" : "Needs setting up", href: "/dashboard/settings" },
    { done: saved >= 3, label: "Save 3 investors", note: `${Math.min(saved, 3)} of 3 saved`, href: "/dashboard/investors" },
    { done: (stats?.investors_contacted ?? 0) > 0, label: "Send first email", note: "Drafted by Claude", href: "/dashboard/investors" },
    { done: (stats?.investors_replied ?? 0) > 0, label: "Get first reply", note: "We email you", href: "/dashboard/inbox" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.findIndex((s) => !s.done);

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 md:px-8">
      <Settle>
        <p className="text-[13px] text-label">{today}</p>
        <h2 className="mt-1 text-[clamp(28px,3.2vw,36px)] leading-tight tracking-[-0.045em]">
          Welcome back,{" "}
          <span className="relative inline-block">
            {profile.first_name ?? "founder"}
            <ScribbleUnderline className="absolute -bottom-1.5 left-0 h-3 w-full" immediate delay={0.4} />
          </span>
        </h2>
        <p className="mt-2 text-[14.5px] text-muted">
          {startup.name} is raising a {label(STAGES, startup.stage) || "round"}.{" "}
          {firstSent != null ? (
            <>
              First investor email sent <span className="font-medium text-ink">{firstSent} minutes</span> after signup.
            </>
          ) : (
            "Your next step is your first investor email."
          )}
        </p>
      </Settle>

      {doneCount < steps.length && (
        <Settle delay={60}>
          <Card className="mt-6">
            <div className="flex items-center justify-between gap-3 border-b border-line-2 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <BrandMark className="h-4 w-4" />
                <p className="text-[14px] font-semibold text-ink">Getting to your first reply</p>
              </div>
              <span className="tabular text-[12.5px] text-label">
                {doneCount} of {steps.length} done
              </span>
            </div>
            <ol className="grid gap-1 px-3 py-3 sm:grid-cols-5 sm:gap-0 sm:px-2 sm:py-5">
              {steps.map((s, i) => {
                const current = i === nextStep;
                const lineDone = s.done && steps[i + 1]?.done;
                return (
                  <li key={s.label} className="relative">
                    {/* Connector to the next step (desktop only) */}
                    {i < steps.length - 1 && (
                      <span
                        aria-hidden
                        className={cn("absolute left-[calc(1rem+28px)] right-2 top-[14px] hidden h-px sm:block", lineDone ? "bg-vermilion/60" : "bg-line")}
                      />
                    )}
                    <Link href={s.href} className="group relative flex items-center gap-3 rounded-[6px] px-2 py-2 hover:bg-black/[0.025] sm:flex-col sm:items-start sm:gap-2.5">
                      <span
                        className={cn(
                          "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold tabular",
                          s.done && "border-[#e9c4ba] bg-pencil-soft",
                          current && "border-burgundy bg-burgundy text-ivory",
                          !s.done && !current && "border-line bg-panel text-label",
                        )}
                      >
                        {s.done ? <ScribbleTick className="h-4 w-4" color="var(--color-vermilion)" immediate delay={0.2 + i * 0.1} /> : i + 1}
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className={cn("block text-[13.5px]", s.done ? "text-muted" : "font-medium text-ink")}>{s.label}</span>
                        <span className={cn("mt-0.5 block text-[12px]", current ? "text-vermilion" : "text-label")}>{s.note}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </Card>
        </Settle>
      )}

      <Settle delay={120} className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Emails sent" value={String(stats?.emails_sent ?? 0)} note={plural(stats?.investors_contacted ?? 0, "investor", "contacted")} loading={loading} />
        <Stat label="Investors saved" value={String(stats?.investors_saved ?? 0)} note="On your shortlist" loading={loading} />
        <Stat label="Investors replied" value={String(stats?.investors_replied ?? 0)} note={plural(stats?.replies ?? 0, "reply", "in total", "replies")} loading={loading} />
        <Stat label="Open rate" value={`${Math.round(Number(stats?.open_rate ?? 0))}%`} note={`${stats?.opened ?? 0} of ${stats?.emails_sent ?? 0} opened`} loading={loading} />
      </Settle>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr] [&>*]:min-w-0">
        <div className="space-y-6">
          <Settle delay={180}>
            <Card>
              <CardHeader
                title="Outreach, last 14 days"
                sub="Emails sent and replies received"
                action={
                  <div className="flex items-center gap-3 text-[12px] text-label">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 bg-[#9a8d88]" /> Sent
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 bg-vermilion" /> Replies
                    </span>
                  </div>
                }
              />
              <div className="relative px-5 pb-3 pt-5">
                {messages ? <ActivityChart days={days} /> : <Skeleton className="aspect-[640/172] w-full" />}
                {messages && messages.length === 0 && (
                  <p className="absolute inset-0 flex items-center justify-center text-[13px] text-label">Your first sends will draw here.</p>
                )}
              </div>
            </Card>
          </Settle>

          <Settle delay={240}>
            <Card>
              <CardHeader
                title="Best-fit investors"
                sub="Scored on sector, stage, values and revenue"
                action={
                  <ButtonLink href="/dashboard/investors" size="sm" variant="ghost">
                    All investors <ArrowRight className="h-3.5 w-3.5" />
                  </ButtonLink>
                }
              />
              {!rows ? (
                <ul aria-hidden>
                  {Array.from({ length: 5 }, (_, i) => (
                    <li key={i} className="flex items-center gap-3 border-b border-line-2 px-5 py-3 last:border-b-0">
                      <Skeleton className="h-7 w-7 rounded-[6px]" />
                      <div className="min-w-0 flex-1 leading-tight">
                        <span className="block text-[13.5px]">
                          <Skeleton className="inline-block h-[0.8em] align-middle" style={{ width: 96 + (i % 3) * 18 }} />
                        </span>
                        <span className="block text-[12px]">
                          <Skeleton className="inline-block h-[0.8em] align-middle" style={{ width: 150 + (i % 2) * 40 }} />
                        </span>
                      </div>
                      <div className="hidden w-28 items-center gap-2 sm:flex">
                        <Skeleton className="h-1.5 flex-1 rounded-full" />
                        <Skeleton className="h-3 w-6" />
                      </div>
                      <Skeleton className="h-8 w-[76px] rounded-[6px]" />
                    </li>
                  ))}
                </ul>
              ) : (
                <ul>
                  {top.map((r, i) => (
                    <li key={r.id} className="settle flex items-center gap-3 border-b border-line-2 px-5 py-3 last:border-b-0" style={{ animationDelay: `${i * 30}ms` }}>
                      <Avatar name={r.full_name} />
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-[13.5px] font-medium text-ink">{r.full_name}</p>
                        <p className="truncate text-[12px] text-label">
                          {r.firm}
                          {r.reasons.length ? `, ${r.reasons.slice(0, 2).join(", ").toLowerCase()}` : ""}
                        </p>
                      </div>
                      <div className="hidden w-28 items-center gap-2 sm:flex">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-3">
                          <div className="h-full rounded-full bg-burgundy" style={{ width: `${r.score}%` }} />
                        </div>
                        <span className="tabular w-6 text-right text-[12.5px] text-muted">{r.score}</span>
                      </div>
                      {r.replied ? (
                        <Pill tone="green">Replied</Pill>
                      ) : r.contacted ? (
                        <Pill tone="burgundy">Contacted</Pill>
                      ) : (
                        <Button size="sm" onClick={() => setComposeFor(r)}>
                          <Mail className="h-3.5 w-3.5" /> Email
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Settle>
        </div>

        <Settle delay={300}>
          <Card className="h-full">
            <CardHeader
              title="Inbox"
              sub="Replies from investors land here"
              action={
                <ButtonLink href="/dashboard/inbox" size="sm" variant="ghost">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </ButtonLink>
              }
            />
            {!threads ? (
              <ul aria-hidden>
                {Array.from({ length: 6 }, (_, i) => (
                  <li key={i} className="flex items-center gap-3 border-b border-line-2 px-5 py-3">
                    <span className="h-1.5 w-1.5 shrink-0" />
                    <div className="min-w-0 flex-1 leading-tight">
                      <span className="block text-[13.5px]">
                        <Skeleton className="inline-block h-[0.8em] align-middle" style={{ width: 90 + (i % 3) * 22 }} />
                      </span>
                      <span className="block text-[12px]">
                        <Skeleton className="inline-block h-[0.8em] align-middle" style={{ width: 140 + (i % 2) * 50 }} />
                      </span>
                    </div>
                    <Skeleton className="h-3 w-12" />
                  </li>
                ))}
              </ul>
            ) : threads.length === 0 ? (
              <Empty title="Nothing here yet" body="Send your first email and replies will appear here, with an email to you when one lands." />
            ) : (
              <ul>
                {threads.slice(0, 7).map((t, i) => (
                  <li key={t.id} className="settle" style={{ animationDelay: `${i * 30}ms` }}>
                    <Link href={`/dashboard/inbox?thread=${t.id}`} className="flex items-center gap-3 border-b border-line-2 px-5 py-3 hover:bg-black/[0.02]">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", t.isRead ? "bg-transparent" : "bg-vermilion")} />
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className={cn("truncate text-[13.5px]", t.isRead ? "text-ink" : "font-semibold text-ink")}>{t.investor?.full_name ?? t.sender?.replace(/\s*<.*$/, "") ?? t.subject}</p>
                        <p className="truncate text-[12px] text-label">{t.investor ? t.subject : `${t.messageCount} message${t.messageCount === 1 ? "" : "s"}`}</p>
                      </div>
                      <span className="shrink-0 text-[12px] text-label">{timeAgo(t.lastMessageAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Settle>
      </div>

      <ComposeModal
        investor={composeFor}
        firstEmail={(stats?.emails_sent ?? 0) === 0}
        onClose={() => setComposeFor(null)}
        onSent={() => {
          void reload();
          void reloadInvestors();
        }}
      />
    </div>
  );
}
