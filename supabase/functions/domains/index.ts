// Custom sending domain for a founder's inbox, through OpenMail custom domains.
// Actions:
//   status  the founder's domain, refreshed from OpenMail while it is not yet verified
//   add     { domain }   add it (scoped to the founder's pod) and return the DNS records to publish
//   check   ask OpenMail to re-check DNS now
//   switch  { mailbox }  create the founder's inbox on the verified domain and retire the old one
//   remove  delete the domain (only when no active inbox uses it)
import { admin, HttpError, json, readJson, requireUser, serve } from "../_shared/core.ts";
import { openmail, OpenMailError } from "../_shared/openmail.ts";
import { ensurePod, hasStartedPlan, moveInboxToDomain } from "../_shared/inbox.ts";

interface OMDomain {
  id: string;
  domain: string;
  podId: string | null;
  status: "pending" | "verifying" | "verified" | "failed" | "under_review";
  records: unknown[];
  warnings: unknown[];
  verifiedAt: string | null;
  message?: string;
}

interface Body {
  action?: "status" | "add" | "check" | "switch" | "remove";
  domain?: string;
  mailbox?: string;
}

const COLUMNS = "id, domain, status, records, warnings, message, verified_at, checked_at, created_at";
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const BLOCKED = /(^|\.)(omail\.sh|openmail\.sh|gmail\.com|googlemail\.com|outlook\.com|hotmail\.com|yahoo\.com|icloud\.com|centralegtm\.com)$/;

function cleanDomain(input: string) {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!DOMAIN_RE.test(d)) throw new HttpError(400, "Enter a domain like mail.yourcompany.com");
  if (BLOCKED.test(d)) throw new HttpError(400, "Use a domain your company owns");
  return d;
}

/** Copies OpenMail's view of the domain onto our row. */
async function sync(rowId: string, d: OMDomain) {
  const { data } = await admin
    .from("sending_domains")
    .update({
      status: d.status,
      records: d.records ?? [],
      warnings: d.warnings ?? [],
      message: d.message ?? null,
      verified_at: d.verifiedAt,
      checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId)
    .select(COLUMNS)
    .single();
  return data;
}

async function current(ownerId: string) {
  const { data } = await admin.from("sending_domains").select(`${COLUMNS}, openmail_domain_id`).eq("owner_id", ownerId).neq("status", "removed").maybeSingle();
  return data;
}

function friendly(err: unknown): never {
  if (err instanceof OpenMailError) {
    if (err.code === "domain_taken") throw new HttpError(409, "That domain is already connected to another account.");
    if (err.code === "domain_blocked") throw new HttpError(422, "That domain cannot be used for sending.");
    if (err.code === "invalid_domain") throw new HttpError(422, "That does not look like a domain you can add.");
    if (err.code === "plan_limit" || err.code === "spend_cap_paused" || err.status === 402) {
      console.error("OpenMail plan does not allow custom domains", err);
      throw new HttpError(503, "Custom domains are not available on our mail account right now. We have been notified.");
    }
    if (err.status === 429) throw new HttpError(429, "Too many checks. Try again in a minute.");
  }
  throw err;
}

serve(async (req) => {
  const user = await requireUser(req);
  const input = await readJson<Body>(req);
  const action = input.action ?? "status";

  if (action !== "status" && !(await hasStartedPlan(user.id))) {
    throw new HttpError(402, "Start your free trial to connect a domain.");
  }

  const row = await current(user.id);
  const { data: inbox } = await admin.from("inboxes").select("address, domain, openmail_pod_id").eq("owner_id", user.id).eq("status", "active").maybeSingle();

  switch (action) {
    case "status": {
      if (!row) return json({ domain: null, inbox });
      // Refresh from OpenMail at most every 10 seconds until it verifies.
      const stale = !row.checked_at || Date.now() - Date.parse(row.checked_at) > 10_000;
      if (row.status !== "verified" && stale) {
        try {
          const fresh = await openmail<OMDomain>(`/v1/domains/${row.openmail_domain_id}`);
          return json({ domain: await sync(row.id, fresh), inbox });
        } catch (err) {
          console.warn("domain refresh failed", err);
        }
      }
      const { openmail_domain_id: _, ...out } = row;
      return json({ domain: out, inbox });
    }

    case "add": {
      if (row) throw new HttpError(409, `You already connected ${row.domain}. Remove it first to use another domain.`);
      const domain = cleanDomain(input.domain ?? "");
      const { data: taken } = await admin.from("sending_domains").select("owner_id").eq("domain", domain).neq("status", "removed").maybeSingle();
      if (taken) throw new HttpError(409, "That domain is already connected to another account.");

      const podId = inbox?.openmail_pod_id ?? (await ensurePod(user.id, user.email ?? user.id));
      let created: OMDomain;
      try {
        created = await openmail<OMDomain>("/v1/domains", { body: { domain, ...(podId ? { podId } : {}) } });
      } catch (err) {
        // Added before (for example after a remove that did not finish): adopt it if it is ours.
        if (err instanceof OpenMailError && err.code === "domain_exists") {
          const list = await openmail<{ data: OMDomain[] }>("/v1/domains?limit=100");
          const mine = list.data.find((d) => d.domain === domain && (!podId || d.podId === podId));
          if (!mine) friendly(new OpenMailError(409, "domain_taken", "taken"));
          created = mine!;
        } else friendly(err);
      }
      const { data: saved, error } = await admin
        .from("sending_domains")
        .upsert(
          {
            owner_id: user.id,
            domain,
            openmail_domain_id: created!.id,
            status: created!.status,
            records: created!.records ?? [],
            warnings: created!.warnings ?? [],
            message: created!.message ?? null,
            verified_at: created!.verifiedAt,
            checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "domain" },
        )
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return json({ domain: saved, inbox });
    }

    case "check": {
      if (!row) throw new HttpError(404, "Add a domain first");
      try {
        const fresh = await openmail<OMDomain>(`/v1/domains/${row.openmail_domain_id}/verify`, { method: "POST" });
        return json({ domain: await sync(row.id, fresh.records ? fresh : await openmail<OMDomain>(`/v1/domains/${row.openmail_domain_id}`)), inbox });
      } catch (err) {
        friendly(err);
      }
      break;
    }

    case "switch": {
      if (!row || row.status !== "verified") throw new HttpError(400, "Your domain is not verified yet");
      if (inbox?.domain === row.domain) throw new HttpError(400, `Your inbox already sends from ${row.domain}`);
      const mailbox = (input.mailbox ?? "").trim().toLowerCase();
      if (!/^[a-z0-9]([a-z0-9._-]{1,28}[a-z0-9])$/.test(mailbox)) {
        throw new HttpError(400, "Use 3 to 30 letters, numbers, dots or dashes, like amira or hello");
      }
      try {
        const moved = await moveInboxToDomain(user.id, row.domain, mailbox, inbox?.openmail_pod_id ?? undefined);
        return json({ ok: true, inbox: { address: moved.address, domain: moved.domain } });
      } catch (err) {
        if (err instanceof OpenMailError && (err.status === 409 || err.status === 400)) {
          throw new HttpError(409, `${mailbox}@${row.domain} is not available. Try another name.`);
        }
        friendly(err);
      }
      break;
    }

    case "remove": {
      if (!row) return json({ ok: true });
      if (inbox?.domain === row.domain) {
        throw new HttpError(400, "Your inbox sends from this domain. It cannot be removed while in use.");
      }
      const { count } = await admin.from("inboxes").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("domain", row.domain);
      if (!count) {
        try {
          await openmail(`/v1/domains/${row.openmail_domain_id}`, { method: "DELETE" });
        } catch (err) {
          if (!(err instanceof OpenMailError && err.status === 404)) friendly(err);
        }
      }
      await admin.from("sending_domains").update({ status: "removed", updated_at: new Date().toISOString() }).eq("id", row.id);
      return json({ ok: true, domain: null, inbox });
    }
  }
  throw new HttpError(400, "Unknown action");
});
