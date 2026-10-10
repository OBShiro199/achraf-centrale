// Runs every minute from pg_cron. Plans automatic follow-ups, then sends whatever in the
// Outbox is due, staying inside OpenMail's limits (10 a minute and 20 cold sends a day per new inbox).
import { admin, HttpError, json, secret, serve } from "../_shared/core.ts";
import { HOUSE_STYLE, structured, tidy } from "../_shared/claude.ts";
import { openmail, OpenMailError, type OMSendResult } from "../_shared/openmail.ts";
import { resolveRecipient, toTrackedHtml, withTestNote } from "../_shared/mail.ts";
import { hasPaidPlan } from "../_shared/inbox.ts";
import { loadInvestor } from "../_shared/investor.ts";

const DAILY_CAP = 20;
const PER_RUN_PER_INBOX = 8;
const PLAN_PER_RUN = 5;

interface Scheduled {
  id: string;
  owner_id: string;
  investor_id: number;
  kind: "first" | "follow_up";
  parent_message_id: string | null;
  thread_id: string | null;
  subject: string;
  body: string;
  attempts: number;
}

const startOfUtcDay = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const tomorrowMorning = (offsetMinutes: number) => {
  const d = startOfUtcDay();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(8, offsetMinutes, 0, 0);
  return d.toISOString();
};

async function hasReplied(ownerId: string, investorId: number, threadId: string | null) {
  let q = admin.from("outreach_messages").select("id").eq("owner_id", ownerId).eq("direction", "inbound");
  q = threadId ? q.or(`openmail_thread_id.eq.${threadId},investor_id.eq.${investorId}`) : q.eq("investor_id", investorId);
  const { data } = await q.limit(1);
  return Boolean(data?.length);
}

/** Drafts one follow-up per first email that has gone unanswered, due after the founder's chosen delay. */
async function planFollowUps(dryRun: boolean) {
  const { data: candidates, error } = await admin.rpc("follow_up_candidates", { p_limit: PLAN_PER_RUN });
  if (error) throw error;
  const planned: { investor: string; send_after: string; body: string }[] = [];

  for (const c of candidates ?? []) {
    const [investor, { data: profile }, { data: startup }] = await Promise.all([
      loadInvestor(Number(c.investor_id)).catch(() => null),
      admin.from("profiles").select("first_name").eq("id", c.owner_id).single(),
      admin.from("startups").select("name, one_liner, traction").eq("owner_id", c.owner_id).single(),
    ]);
    if (!investor) continue;

    const draft = await structured<{ body: string }>({
      system: `You write short follow-ups from a founder to an investor who has not replied to a first email. 40 to 70 words. Friendly, no guilt, no "just bumping this". Add at most one new true fact from the startup context if one exists, otherwise simply ask whether a short call is worth it. Greeting line, one or two short paragraphs, sign off with the founder's first name. Never invent facts. ${HOUSE_STYLE}`,
      content: [{
        type: "text",
        text: `<startup>\nName: ${startup?.name}\nOne-liner: ${startup?.one_liner ?? ""}\nTraction: ${startup?.traction ?? "not stated"}\nFounder first name: ${profile?.first_name ?? ""}\n</startup>\n\n<first_email to="${investor.full_name}, ${investor.firm}" subject="${c.subject}">\n${c.body}\n</first_email>\n\nWrite the follow-up.`,
      }],
      schema: { type: "object", additionalProperties: false, required: ["body"], properties: { body: { type: "string" } } },
      effort: "low",
      maxTokens: 2000,
      track: { owner: c.owner_id, feature: "follow_up_draft" },
    });

    const due = new Date(new Date(c.sent_at).getTime() + c.follow_up_days * 86_400_000);
    const earliest = new Date(Date.now() + 30 * 60_000); // always visible in the Outbox for at least 30 minutes
    const sendAfter = (due > earliest ? due : earliest).toISOString();
    const body = tidy(draft.body);
    planned.push({ investor: investor.full_name, send_after: sendAfter, body });
    if (dryRun) continue;

    const { error: saveError } = await admin.from("scheduled_emails").upsert(
      {
        owner_id: c.owner_id,
        investor_id: c.investor_id,
        kind: "follow_up",
        parent_message_id: c.message_id,
        thread_id: c.thread_id,
        subject: c.subject.startsWith("Re:") ? c.subject : `Re: ${c.subject}`,
        body,
        send_after: sendAfter,
      },
      { onConflict: "parent_message_id", ignoreDuplicates: true },
    );
    // A failed save would re-draft the same follow-up every minute, so stop the run instead.
    if (saveError) throw saveError;
  }
  return planned;
}

/** Sends due emails. Returns a short log line per email. */
async function sendDue() {
  const { data: claimed, error } = await admin.rpc("claim_due_emails", { p_limit: 25 });
  if (error) throw error;
  const log: string[] = [];
  const sentThisRun = new Map<string, number>();
  const sentToday = new Map<string, number>();

  for (const e of (claimed ?? []) as Scheduled[]) {
    const requeue = (patch: Record<string, unknown>) =>
      admin.from("scheduled_emails").update({ status: "queued", ...patch }).eq("id", e.id);

    const { data: inbox } = await admin.from("inboxes").select("*").eq("owner_id", e.owner_id).eq("status", "active").maybeSingle();
    if (!inbox) {
      await requeue({ send_after: new Date(Date.now() + 3_600_000).toISOString(), last_error: "No sending inbox yet" });
      log.push(`${e.id}: no inbox, retry in 1h`);
      continue;
    }

    // Trials and lapsed plans keep their queue; it sends once the plan is paid.
    if (!(await hasPaidPlan(e.owner_id))) {
      await requeue({ send_after: new Date(Date.now() + 3_600_000).toISOString(), last_error: "Sending starts when your plan starts" });
      log.push(`${e.id}: no paid plan, retry in 1h`);
      continue;
    }

    if (e.kind === "follow_up" && (await hasReplied(e.owner_id, e.investor_id, e.thread_id))) {
      await admin.from("scheduled_emails").update({ status: "cancelled", last_error: "Investor replied" }).eq("id", e.id);
      log.push(`${e.id}: replied, follow-up cancelled`);
      continue;
    }

    if (!sentToday.has(inbox.id)) {
      const { count } = await admin
        .from("outreach_messages")
        .select("id", { count: "exact", head: true })
        .eq("inbox_id", inbox.id)
        .eq("direction", "outbound")
        .gte("sent_at", startOfUtcDay().toISOString());
      sentToday.set(inbox.id, count ?? 0);
    }
    if ((sentToday.get(inbox.id) ?? 0) >= DAILY_CAP) {
      await requeue({ send_after: tomorrowMorning(Math.floor(Math.random() * 90)), last_error: null });
      log.push(`${e.id}: daily limit, moved to tomorrow`);
      continue;
    }
    if ((sentThisRun.get(inbox.id) ?? 0) >= PER_RUN_PER_INBOX) {
      await requeue({ send_after: new Date(Date.now() + 60_000).toISOString() });
      continue;
    }

    const investor = await loadInvestor(Number(e.investor_id)).catch(() => null);
    if (!investor || !investor.email) {
      await admin.from("scheduled_emails").update({ status: "failed", last_error: investor ? "No email address for this investor" : "Investor no longer exists" }).eq("id", e.id);
      continue;
    }

    const outreachId = crypto.randomUUID();
    let result: OMSendResult;
    let to = investor.email;
    try {
      const recipient = await resolveRecipient(investor, e.owner_id);
      to = recipient.to;
      const html = toTrackedHtml(recipient.test ? withTestNote(e.body, investor) : e.body, outreachId);
      result = await openmail<OMSendResult>(`/v1/inboxes/${inbox.openmail_inbox_id}/send`, {
        idempotencyKey: `outbox-${e.id}`,
        body: e.kind === "follow_up" && e.thread_id
          ? { to, threadId: e.thread_id, body: html, includeQuote: true }
          : { to, subject: e.subject, body: html },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Send failed";
      if (err instanceof OpenMailError && err.status === 429) {
        await requeue({ send_after: new Date(Date.now() + 3_600_000).toISOString(), last_error: "Rate limited, retrying in an hour" });
      } else if (e.attempts >= 3) {
        await admin.from("scheduled_emails").update({ status: "failed", last_error: msg }).eq("id", e.id);
      } else {
        await requeue({ send_after: new Date(Date.now() + 10 * 60_000).toISOString(), last_error: msg });
      }
      log.push(`${e.id}: ${msg}`);
      continue;
    }

    const { error: insertError } = await admin.from("outreach_messages").insert({
      id: outreachId,
      owner_id: e.owner_id,
      investor_id: e.investor_id,
      inbox_id: inbox.id,
      direction: "outbound",
      kind: e.kind,
      openmail_message_id: result.messageId,
      openmail_thread_id: result.threadId,
      from_addr: inbox.address,
      to_addr: to,
      subject: e.subject,
      body: e.body,
      status: result.status,
    });
    if (insertError) console.error("outreach insert failed", insertError);

    await admin.from("scheduled_emails").update({ status: "sent", outreach_message_id: insertError ? null : outreachId, last_error: null }).eq("id", e.id);
    if (e.kind === "first") {
      await admin.from("saved_investors").upsert({ owner_id: e.owner_id, investor_id: e.investor_id }, { ignoreDuplicates: true });
    }
    sentThisRun.set(inbox.id, (sentThisRun.get(inbox.id) ?? 0) + 1);
    sentToday.set(inbox.id, (sentToday.get(inbox.id) ?? 0) + 1);
    log.push(`${e.id}: sent ${e.kind}`);
  }
  return log;
}

serve(async (req) => {
  const provided = req.headers.get("x-cron-secret");
  if (!provided || provided !== (await secret("CRON_SECRET"))) throw new HttpError(401, "Unauthorised");
  const { dry_run = false } = await req.json().catch(() => ({}));

  const planned = await planFollowUps(Boolean(dry_run));
  const sent = dry_run ? [] : await sendDue();
  return json({ ok: true, planned, sent });
});
