// Sending limits shared by the Outbox worker and direct sends. OpenMail caps cold email twice: 20 a day per
// new inbox, and a total across the whole account (150 a day on Pro for its first 30 days, then 500).
// Over either limit OpenMail refuses the send, so Centrale stops first and holds the email for tomorrow.
import { admin, secret } from "./core.ts";

export const INBOX_DAILY_CAP = 20;
/** OpenMail Pro's account cap in its first 30 days. Set OPENMAIL_ACCOUNT_DAILY_CAP in Vault when the plan changes. */
const DEFAULT_ACCOUNT_DAILY_CAP = 150;

export function startOfUtcDay() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function accountDailyCap() {
  return Number(await secret("OPENMAIL_ACCOUNT_DAILY_CAP").catch(() => "")) || DEFAULT_ACCOUNT_DAILY_CAP;
}

/** Outbound emails sent since midnight UTC, from one inbox or from every founder's inbox. */
export async function sentToday(inboxId?: string) {
  let q = admin
    .from("outreach_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "outbound")
    .gte("sent_at", startOfUtcDay().toISOString());
  if (inboxId) q = q.eq("inbox_id", inboxId);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** Which limit, if any, stops one more email from this inbox today. */
export async function dailyLimitReached(inboxId: string): Promise<"inbox" | "account" | null> {
  const [inbox, account, cap] = await Promise.all([sentToday(inboxId), sentToday(), accountDailyCap()]);
  if (inbox >= INBOX_DAILY_CAP) return "inbox";
  if (account >= cap) return "account";
  return null;
}
