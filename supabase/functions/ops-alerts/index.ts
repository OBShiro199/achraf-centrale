// Hourly health check from pg_cron. Emails staff (OPS_ALERT_EMAIL, default oliverburt3@gmail.com) from the
// system inbox when something needs a look. Each problem emails at most once every 6 hours.
import { admin, HttpError, json, secret, serve } from "../_shared/core.ts";
import { emailStaff } from "../_shared/staff.ts";
import { accountDailyCap, sentToday } from "../_shared/limits.ts";

/** Above this, a day's Claude and Firecrawl spend across all founders is worth a look. */
const DAILY_SPEND_ALERT_USD = 25;
/** Above this, one founder's day of spend is worth a look. */
const FOUNDER_SPEND_ALERT_USD = 5;
/** The database plan's size limit when OPS_DB_LIMIT_MB is not set (Pro); past 90% of it the database can go read-only. */
const DEFAULT_DB_LIMIT_MB = 8 * 1024;

interface Snapshot {
  cron_failures: { job: string; runs: number; last_error: string | null }[];
  failed_sends: number;
  stuck_sends: number;
  failed_decks: number;
  stuck_decks: number;
  spend_24h_usd: number;
  top_spender_24h: { email: string | null; usd: number } | null;
  db_size_mb: number;
  read_only: boolean;
  /** Live sends and permanent bounces over 7 days, across every inbox and for inboxes bouncing too often. */
  bounces: { sent: number; bounced: number };
  bounce_inboxes: { address: string; sent: number; bounced: number }[];
}

/** Mailbox providers start filtering a sender at around 2 to 3% bounces; OpenMail suspends inboxes above that. */
const BOUNCE_ALERT_RATE = 0.03;

/** Webhooks alert on any failure; other functions once they fail 3 times in an hour. */
function functionProblems(errors: { fn: string; n: number; last: string }[]) {
  return errors
    .filter((e) => e.fn.endsWith("-webhook") || e.n >= 3)
    .map((e) => ({ key: `fn:${e.fn}`, text: `${e.fn} failed ${e.n} time${e.n === 1 ? "" : "s"} in the last hour. Latest: ${e.last}` }));
}

function problems(s: Snapshot, dbLimitMb: number, sends: { sent: number; cap: number }) {
  const out: { key: string; text: string }[] = [];
  if (sends.sent >= sends.cap * 0.8) {
    out.push({ key: "account_cap", text: `${sends.sent} of OpenMail's ${sends.cap} daily account sends are used. Past the cap, emails wait until tomorrow; ask OpenMail about Enterprise.` });
  }
  if (s.bounces.sent >= 50 && s.bounces.bounced / s.bounces.sent > BOUNCE_ALERT_RATE) {
    const pct = Math.round((s.bounces.bounced / s.bounces.sent) * 1000) / 10;
    out.push({ key: "bounce_rate", text: `${pct}% of emails bounced in the last 7 days (${s.bounces.bounced} of ${s.bounces.sent}). Above 3% risks every founder's delivery; check the directory's addresses.` });
  }
  for (const i of s.bounce_inboxes) {
    out.push({ key: `bounce_inbox:${i.address}`, text: `${i.address} had ${i.bounced} of ${i.sent} emails bounce in 7 days. Consider pausing it in the admin console.` });
  }
  if (s.read_only) out.push({ key: "read_only", text: "The database is read-only: saving, sending and signups are failing." });
  if (s.db_size_mb > dbLimitMb * 0.9) out.push({ key: "db_size", text: `The database is ${s.db_size_mb} MB, close to its limit.` });
  for (const c of s.cron_failures) out.push({ key: `cron:${c.job}`, text: `Scheduled job ${c.job} failed ${c.runs} times in the last hour: ${c.last_error ?? "no message"}.` });
  if (s.failed_sends > 0) out.push({ key: "failed_sends", text: `${s.failed_sends} emails failed to send in the last hour. Check the Outbox.` });
  if (s.stuck_sends > 0) out.push({ key: "stuck_sends", text: `${s.stuck_sends} emails have waited over 2 hours past their send time.` });
  if (s.failed_decks > 0) out.push({ key: "failed_decks", text: `${s.failed_decks} pitch decks failed in the last hour.` });
  if (s.stuck_decks > 0) out.push({ key: "stuck_decks", text: `${s.stuck_decks} pitch decks have been running for over 20 minutes.` });
  if (s.spend_24h_usd > DAILY_SPEND_ALERT_USD) out.push({ key: "spend_total", text: `AI and scraping spend was $${s.spend_24h_usd} in the last 24 hours.` });
  if (s.top_spender_24h && s.top_spender_24h.usd > FOUNDER_SPEND_ALERT_USD) {
    out.push({ key: `spend_founder:${s.top_spender_24h.email}`, text: `${s.top_spender_24h.email ?? "One founder"} used $${s.top_spender_24h.usd} of AI and scraping in 24 hours.` });
  }
  return out;
}

serve(async (req) => {
  const provided = req.headers.get("x-cron-secret");
  if (!provided || provided !== (await secret("CRON_SECRET"))) throw new HttpError(401, "Unauthorised");

  const { data, error } = await admin.rpc("ops_snapshot");
  if (error) throw error;
  const snapshot = data as Snapshot;

  const dbLimitMb = Number(await secret("OPS_DB_LIMIT_MB").catch(() => "")) || DEFAULT_DB_LIMIT_MB;
  const due: string[] = [];
  const sends = { sent: await sentToday(), cap: await accountDailyCap() };
  const { data: fnErrors } = await admin.rpc("function_error_counts");
  for (const p of [...problems(snapshot, dbLimitMb, sends), ...functionProblems((fnErrors ?? []) as { fn: string; n: number; last: string }[])]) {
    const { data: send } = await admin.rpc("ops_alert_due", { p_key: p.key });
    if (send) due.push(p.text);
  }
  if (!due.length) return json({ ok: true, alerts: 0, snapshot });

  await emailStaff(
    `Centrale: ${due.length} thing${due.length === 1 ? "" : "s"} to check`,
    "The hourly health check found these. Each problem is emailed at most once every 6 hours.",
    due,
    `ops-${new Date().toISOString().slice(0, 13)}`,
  );
  return json({ ok: true, alerts: due.length });
});
