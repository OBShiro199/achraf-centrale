// Hourly health check from pg_cron. Emails staff (OPS_ALERT_EMAIL, default oliverburt3@gmail.com) from the
// system inbox when something needs a look. Each problem emails at most once every 6 hours.
import { admin, HttpError, json, secret, serve } from "../_shared/core.ts";
import { escapeHtml } from "../_shared/mail.ts";
import { openmail } from "../_shared/openmail.ts";
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
}

function problems(s: Snapshot, dbLimitMb: number, sends: { sent: number; cap: number }) {
  const out: { key: string; text: string }[] = [];
  if (sends.sent >= sends.cap * 0.8) {
    out.push({ key: "account_cap", text: `${sends.sent} of OpenMail's ${sends.cap} daily account sends are used. Past the cap, emails wait until tomorrow; ask OpenMail about Enterprise.` });
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
  for (const p of problems(snapshot, dbLimitMb, sends)) {
    const { data: send } = await admin.rpc("ops_alert_due", { p_key: p.key });
    if (send) due.push(p.text);
  }
  if (!due.length) return json({ ok: true, alerts: 0, snapshot });

  const to = (await secret("OPS_ALERT_EMAIL").catch(() => "oliverburt3@gmail.com")).trim();
  const app = await secret("APP_URL").catch(() => "https://www.centralegtm.com");
  await openmail(`/v1/inboxes/${await secret("OPENMAIL_SYSTEM_INBOX_ID")}/send`, {
    idempotencyKey: `ops-${new Date().toISOString().slice(0, 13)}`,
    body: {
      to,
      subject: `Centrale: ${due.length} thing${due.length === 1 ? "" : "s"} to check`,
      body: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#141414">
<p>The hourly health check found:</p><ul>${due.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>
<p style="color:#777;font-size:12px">Each problem is emailed at most once every 6 hours. Running costs are in ${escapeHtml(app)}/dashboard/settings.</p></div>`,
    },
  });
  return json({ ok: true, alerts: due.length });
});
