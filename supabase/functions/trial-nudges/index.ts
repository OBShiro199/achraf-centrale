// Runs hourly from pg_cron. On days 1, 3 and 6 of a founder's trial it emails them, from the system inbox, the
// next things worth doing: email their first 10 matches, connect LinkedIn or WhatsApp, make a call. The aim is
// real conversations before the first payment. Each nudge is claimed in private.trial_nudges before it is sent,
// so it never goes twice; a founder who has done everything gets a short note instead of a to-do list.
import { admin, HttpError, json, secret, serve } from "../_shared/core.ts";
import { escapeHtml } from "../_shared/mail.ts";
import { openmail } from "../_shared/openmail.ts";

interface Candidate {
  owner_id: string;
  email: string;
  first_name: string | null;
  day: 1 | 3 | 6;
  trial_ends_at: string;
  plan_id: string;
  investors_emailed: number;
  replies: number;
  linkedin: boolean;
  whatsapp: boolean;
  calls: number;
  has_number: boolean;
}

interface Step {
  done: boolean;
  text: string;
  path: string;
  cta: string;
}

function steps(c: Candidate): Step[] {
  return [
    {
      done: c.investors_emailed >= 10,
      text: c.investors_emailed ? `Email the rest of your first 10 matches. You have written to ${c.investors_emailed} so far.` : "Email your first 10 matches. Claude has drafted each one; read it and send.",
      path: "/dashboard/investors?picks=1",
      cta: "Open your matches",
    },
    {
      done: c.linkedin || c.whatsapp,
      text: "Connect LinkedIn or WhatsApp. Many investors answer a short note faster than an email.",
      path: "/dashboard/settings#channels",
      cta: "Connect a channel",
    },
    {
      done: c.calls > 0,
      text: c.has_number ? "Make your first call from your US number. It is recorded, summarised and tagged for you." : "Get your US number and make your first call from the browser.",
      path: c.has_number ? "/dashboard/investors?picks=1" : "/dashboard/settings#channels",
      cta: "Make a call",
    },
  ];
}

function subject(c: Candidate, todo: Step[]) {
  if (c.day === 6) return "Your Centrale trial ends tomorrow";
  if (!todo.length) return c.replies ? "Your raise is moving" : "Replies usually take a few days";
  return c.day === 1 ? "Your first 10 investors are waiting" : "Three days in: what to do next";
}

function body(c: Candidate, todo: Step[], app: string, price: string | null) {
  const name = escapeHtml(c.first_name ?? "there");
  const ends = new Date(c.trial_ends_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const intro = c.day === 6
    ? `Your trial ends on ${ends}${price ? `, when your plan starts at ${price}` : ""}. Nothing to do if you are staying; to cancel, use Manage subscription on the Billing page before then.`
    : todo.length
    ? c.day === 1
      ? "Your profile and your first 10 investors are ready. The sooner you reach out, the sooner replies come in, and a second channel helps."
      : `You have ${c.replies ? `${c.replies} conversation${c.replies === 1 ? "" : "s"} with replies` : "no replies yet"}. A few steps make the most of the trial:`
    : c.replies
    ? `You have ${c.replies} conversation${c.replies === 1 ? "" : "s"} with replies. Keep an eye on your Inbox: Claude tags who is interested.`
    : "You have done everything we would suggest. Investors often take a few days to answer; follow-ups go out by themselves.";
  const list = todo.slice(0, 3).map((s) =>
    `<tr><td style="padding:10px 0;border-top:1px solid #e7dfd2"><p style="margin:0 0 6px">${escapeHtml(s.text)}</p><a href="${app}${s.path}" style="color:#391c25;font-weight:600">${escapeHtml(s.cta)}</a></td></tr>`
  ).join("");
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#391c25;max-width:520px;background:#f6f1e8;padding:28px;border-radius:10px">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>
<td style="padding:0 3px 0 0"><div style="width:10px;height:10px;background:#d94a38;border-radius:3px"></div></td>
<td style="padding:0 3px"><div style="width:10px;height:10px;background:#391c25;border-radius:3px"></div></td>
<td style="padding:0 3px"><div style="width:10px;height:10px;background:#d94a38;border-radius:3px"></div></td>
<td style="padding:0 3px"><div style="width:10px;height:10px;background:#e8a193;border-radius:3px"></div></td>
<td style="padding:0 0 0 10px;font-weight:600;font-size:15px;color:#391c25">centrale</td></tr></table>
<p style="margin:0 0 12px">Hi ${name},</p>
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
${list ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px">${list}</table>` : ""}
<p style="margin:0"><a href="${app}/dashboard" style="display:inline-block;background:#391c25;color:#f6f1e8;text-decoration:none;padding:10px 16px;border-radius:6px">Open Centrale</a></p>
<p style="margin:22px 0 0;font-size:12px;color:#9a8d88">You get three of these during your trial, then no more.</p>
</div>`;
}

serve(async (req) => {
  const provided = req.headers.get("x-cron-secret");
  if (!provided || provided !== (await secret("CRON_SECRET"))) throw new HttpError(401, "Unauthorised");
  const { dry_run = false } = await req.json().catch(() => ({}));

  const { data, error } = await admin.rpc("trial_nudge_candidates");
  if (error) throw error;
  const app = (await secret("APP_URL").catch(() => "https://www.centralegtm.com")).replace(/\/$/, "");
  const { data: plans } = await admin.from("plans").select("id, price, period_months");
  const priceOf = (id: string) => {
    const p = plans?.find((x) => x.id === id);
    return p?.price ? `$${Number(p.price)} ${Number(p.period_months) > 1 ? `every ${p.period_months} months` : "a month"}` : null;
  };
  const inbox = await secret("OPENMAIL_SYSTEM_INBOX_ID");

  const log: string[] = [];
  for (const c of (data ?? []) as Candidate[]) {
    const todo = steps(c).filter((s) => !s.done);
    if (dry_run) {
      log.push(`${c.email} day ${c.day}: ${subject(c, todo)} (${todo.length} to do)`);
      continue;
    }
    const { data: claimed } = await admin.rpc("claim_trial_nudge", { p_owner: c.owner_id, p_day: c.day });
    if (!claimed) continue;
    try {
      await openmail(`/v1/inboxes/${inbox}/send`, {
        idempotencyKey: `trial-nudge-${c.owner_id}-${c.day}`,
        body: { to: c.email, subject: subject(c, todo), body: body(c, todo, app, priceOf(c.plan_id)) },
      });
      log.push(`${c.email} day ${c.day}: sent`);
    } catch (err) {
      log.push(`${c.email} day ${c.day}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return json({ ok: true, nudges: log });
});
