"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminActions } from "@/components/app/admin-actions";
import { Card, CardHeader, Empty, Pill, Settle, Skeleton } from "@/components/ui/kit";
import { createClient } from "@/lib/supabase/client";
import { cn, timeAgo } from "@/lib/utils";

interface Overview {
  founders: { total: number; new_7d: number; by_plan: { plan: string; status: string; n: number }[] };
  sending: { today: number; cap: number; queued: number; by_day: { day: string; sent: number; replies: number }[] };
  deliverability: {
    suppressed: Record<string, number>;
    suppressed_7d: number;
    failed_7d: number;
    removals: number;
    removal_requests_pending: number;
  };
  health: {
    cron_failures: { job: string; runs: number; last_error: string | null }[];
    failed_sends: number;
    stuck_sends: number;
    failed_decks: number;
    stuck_decks: number;
    spend_24h_usd: number;
    db_size_mb: number;
    read_only: boolean;
  };
  recent: {
    email: string;
    signed_up: string;
    plan: string | null;
    status: string | null;
    startup: string | null;
    inbox: string | null;
    decks: number;
    sent: number;
    replies: number;
    last_sent: string | null;
    spend_usd: number;
  }[];
}

const fmt = (n: number) => n.toLocaleString("en-GB");
const usd = (n: number) => `$${Number(n).toFixed(2)}`;

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "red" | "amber" }) {
  return (
    <div>
      <p className="text-[12px] text-label">{label}</p>
      <p className={cn("tabular text-[22px] font-semibold tracking-[-0.03em]", tone === "red" ? "text-pencil" : tone === "amber" ? "text-amber" : "text-ink")}>
        {value}
      </p>
      {sub && <p className="text-[12px] text-label">{sub}</p>}
    </div>
  );
}

/** Sent emails per day for the last 14 days, replies in a darker band at the base of each bar. */
function SendChart({ days }: { days: Overview["sending"]["by_day"] }) {
  const max = Math.max(1, ...days.map((d) => d.sent));
  if (!days.length) return <p className="px-5 pb-5 text-[13px] text-muted">No emails in the last 14 days.</p>;
  return (
    <div className="flex h-[120px] items-end gap-1.5 px-5 pb-5">
      {days.map((d) => (
        <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.sent} sent, ${d.replies} replies`}>
          <div className="flex w-full flex-col justify-end overflow-hidden rounded-[3px] bg-burgundy/15" style={{ height: `${(d.sent / max) * 90}px`, minHeight: 2 }}>
            <div className="w-full bg-burgundy" style={{ height: d.sent ? `${(Math.min(d.replies, d.sent) / d.sent) * 100}%` : 0 }} />
          </div>
          <span className="tabular text-[10px] text-label">{d.day.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const [data, setData] = useState<Overview | null | undefined>(undefined);

  const load = useCallback(async () => {
    const { data: d, error } = await createClient().rpc("admin_overview");
    setData(error ? null : ((d as Overview | null) ?? null));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (data === undefined) {
    return (
      <div className="mx-auto max-w-[1080px] space-y-4 px-4 py-8 md:px-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[140px] w-full rounded-[10px]" />
        <Skeleton className="h-[320px] w-full rounded-[10px]" />
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-8 md:px-8">
        <Empty title="Staff only" body="This page is for the Centrale team." />
      </div>
    );
  }

  const h = data.health;
  const problems = [
    h.read_only && "Database is read-only",
    ...h.cron_failures.map((c) => `Job ${c.job} failed ${c.runs} times in the last hour`),
    h.failed_sends > 0 && `${h.failed_sends} sends failed in the last hour`,
    h.stuck_sends > 0 && `${h.stuck_sends} emails stuck over 2 hours`,
    h.failed_decks > 0 && `${h.failed_decks} decks failed in the last hour`,
    h.stuck_decks > 0 && `${h.stuck_decks} decks running over 20 minutes`,
  ].filter(Boolean) as string[];
  const capShare = data.sending.today / data.sending.cap;
  const suppressed = Object.values(data.deliverability.suppressed).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-[1080px] space-y-5 px-4 py-8 md:px-8">
      <Settle>
        <div className="flex items-center gap-2">
          <h2 className="text-[26px] tracking-[-0.04em]">Admin</h2>
          <Pill tone="burgundy">Staff</Pill>
        </div>
      </Settle>

      <Settle delay={40}>
        <Card>
          <CardHeader title="Health" sub="The same checks the hourly alert email runs." action={<Pill tone={problems.length ? "red" : "green"}>{problems.length ? `${problems.length} to check` : "All clear"}</Pill>} />
          {problems.length > 0 && (
            <ul className="space-y-1 border-b border-line px-5 py-3 text-[13px] text-pencil">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Stat label="Database size" value={`${fmt(h.db_size_mb)} MB`} />
            <Stat label="AI and scraping, last 24 hours" value={usd(h.spend_24h_usd)} />
            <Stat label="Queued emails" value={fmt(data.sending.queued)} />
          </div>
        </Card>
      </Settle>

      <Settle delay={80}>
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader title="Founders" />
            <div className="grid gap-4 border-b border-line p-5 sm:grid-cols-2">
              <Stat label="Accounts" value={fmt(data.founders.total)} />
              <Stat label="New in 7 days" value={fmt(data.founders.new_7d)} />
            </div>
            <div className="divide-y divide-line-2">
              {data.founders.by_plan.map((p) => (
                <div key={`${p.plan}-${p.status}`} className="flex items-center justify-between px-5 py-2 text-[13px]">
                  <span className="text-body">
                    {p.plan} <span className="text-label">{p.status}</span>
                  </span>
                  <span className="tabular text-muted">{fmt(p.n)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Sending" sub="Across every founder. Dark band is replies." />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Stat
                label="Sent today"
                value={`${fmt(data.sending.today)} / ${fmt(data.sending.cap)}`}
                sub="OpenMail account limit"
                tone={capShare >= 1 ? "red" : capShare >= 0.8 ? "amber" : undefined}
              />
              <Stat
                label="Do-not-email list"
                value={fmt(suppressed)}
                sub={Object.entries(data.deliverability.suppressed).map(([k, v]) => `${v} ${k}`).join(", ") || "Empty"}
              />
            </div>
            <SendChart days={data.sending.by_day} />
          </Card>
        </div>
      </Settle>

      <Settle delay={120}>
        <Card>
          <CardHeader title="Deliverability and removals" />
          <div className="grid gap-4 p-5 sm:grid-cols-4">
            <Stat label="Failed sends, 7 days" value={fmt(data.deliverability.failed_7d)} tone={data.deliverability.failed_7d ? "amber" : undefined} />
            <Stat label="New suppressions, 7 days" value={fmt(data.deliverability.suppressed_7d)} />
            <Stat label="Investors removed" value={fmt(data.deliverability.removals)} />
            <Stat label="Removal links pending" value={fmt(data.deliverability.removal_requests_pending)} />
          </div>
        </Card>
      </Settle>

      <Settle delay={140}>
        <AdminActions onChanged={() => void load()} />
      </Settle>

      <Settle delay={160}>
        <Card>
          <CardHeader title="Latest founders" sub="The 100 most recent accounts." />
          <div className="quiet-scroll overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-label">
                  {["Founder", "Plan", "Inbox", "Decks", "Sent", "Replies", "Last sent", "AI spend"].map((c) => (
                    <th key={c} className="px-4 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line-2">
                {data.recent.map((r) => (
                  <tr key={r.email}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-ink">{r.startup || r.email}</div>
                      <div className="text-[12px] text-label">
                        {r.startup ? `${r.email}, ` : ""}joined {timeAgo(r.signed_up)}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-body">
                      {r.plan ?? "none"} <span className="text-label">{r.status}</span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2 text-muted">{r.inbox ?? "none"}</td>
                    <td className="tabular px-4 py-2">{r.decks}</td>
                    <td className="tabular px-4 py-2">{fmt(r.sent)}</td>
                    <td className="tabular px-4 py-2">{fmt(r.replies)}</td>
                    <td className="px-4 py-2 text-muted">{r.last_sent ? timeAgo(r.last_sent) : "never"}</td>
                    <td className="tabular px-4 py-2">{usd(r.spend_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Settle>
    </div>
  );
}
