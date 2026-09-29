import { createClient } from "@/lib/supabase/client";
import type { ScheduledEmail } from "@/lib/types";

/** A scheduled email with the investor it goes to, as the Outbox reads it. */
export interface ScheduledEmailRow extends ScheduledEmail {
  investor: { id: string; full_name: string; firm: string } | null;
  /** The sent message, for linking to its inbox thread. Only selected for history rows. */
  outreach?: { openmail_thread_id: string | null } | null;
}

// Investor contact details are not readable from the table; the Outbox only needs who and where.
export const SCHEDULED_SELECT = "*, investor:investors(id, full_name, firm)";
export const HISTORY_SELECT = `${SCHEDULED_SELECT}, outreach:outreach_messages!outreach_message_id(openmail_thread_id)`;

export interface QueueItem {
  investor_id: string;
  subject: string;
  body: string;
}

const JITTER_MS = 90_000;

function readable(error: { code?: string; message: string }) {
  if (error.code === "23503") return "One of these investors is no longer in the database.";
  if (error.code === "42501" || /row-level security/i.test(error.message)) return "Your session has expired. Log in again to queue emails.";
  return `Could not queue emails: ${error.message}`;
}

/**
 * Queues first emails in the Outbox. The first one is due straight away and each next one
 * `spacingMinutes` later (default 4) plus up to 90 seconds of jitter, so sends never look batched.
 * The worker still caps sends at 20 a day per inbox and rolls the rest to the next morning.
 */
export async function queueEmails(
  items: QueueItem[],
  opts: { startAt?: Date; spacingMinutes?: number } = {},
): Promise<ScheduledEmailRow[]> {
  if (!items.length) return [];
  const blank = items.findIndex((i) => !i.investor_id || !i.subject.trim() || !i.body.trim());
  if (blank >= 0) throw new Error(`Email ${blank + 1} is missing a subject or body.`);

  const start = (opts.startAt ?? new Date()).getTime();
  const spacing = Math.max(0, opts.spacingMinutes ?? 4) * 60_000;
  const rows = items.map((item, i) => ({
    investor_id: item.investor_id,
    kind: "first" as const,
    subject: item.subject.trim(),
    body: item.body.trim(),
    send_after: new Date(start + i * spacing + (i === 0 ? 0 : Math.floor(Math.random() * JITTER_MS))).toISOString(),
  }));

  const { data, error } = await createClient().from("scheduled_emails").insert(rows).select(SCHEDULED_SELECT);
  if (error) throw new Error(readable(error));
  return (data ?? []) as ScheduledEmailRow[];
}
