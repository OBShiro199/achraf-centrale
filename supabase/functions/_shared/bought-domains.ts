// Finishes domains Centrale bought for founders: once OpenMail verifies one, the founder's inbox moves onto it
// (mailbox = their first name, else hello). Runs from the Outbox worker, so it happens even if they never open
// the domain page.
import { admin } from "./core.ts";
import { openmail } from "./openmail.ts";
import { moveInboxToDomain } from "./inbox.ts";

export async function mailboxFor(ownerId: string) {
  const { data } = await admin.from("profiles").select("first_name").eq("id", ownerId).maybeSingle();
  const first = (data?.first_name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
  return first.length >= 3 ? first.slice(0, 30) : "hello";
}

export async function finishBoughtDomains(limit = 3) {
  const { data: rows } = await admin
    .from("sending_domains")
    .select("id, owner_id, domain, status, openmail_domain_id, checked_at")
    .eq("bought_by_centrale", true)
    .neq("status", "removed")
    .lt("checked_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .gt("created_at", new Date(Date.now() - 3 * 86_400_000).toISOString())
    .limit(limit);
  const log: string[] = [];
  for (const row of rows ?? []) {
    const { data: inbox } = await admin.from("inboxes").select("domain, openmail_pod_id").eq("owner_id", row.owner_id).eq("status", "active").maybeSingle();
    if (inbox?.domain === row.domain) continue;
    try {
      if (row.status !== "verified") {
        const fresh = await openmail<{ status: string; verifiedAt: string | null; records: unknown[] }>(`/v1/domains/${row.openmail_domain_id}`);
        await admin.from("sending_domains").update({ status: fresh.status, verified_at: fresh.verifiedAt, records: fresh.records ?? [], checked_at: new Date().toISOString() }).eq("id", row.id);
        if (fresh.status !== "verified") {
          log.push(`${row.domain}: ${fresh.status}`);
          continue;
        }
      }
      const moved = await moveInboxToDomain(row.owner_id, row.domain, await mailboxFor(row.owner_id), inbox?.openmail_pod_id ?? undefined);
      log.push(`${row.domain}: inbox moved to ${moved.address}`);
    } catch (err) {
      await admin.from("sending_domains").update({ checked_at: new Date().toISOString() }).eq("id", row.id);
      log.push(`${row.domain}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return log;
}
