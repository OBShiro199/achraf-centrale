// Creates a founder's OpenMail inbox (in their own pod). Idempotent: returns the active inbox if one exists.
// Called from provision-inbox (onboarding, trial included), from whop-webhook (when a plan starts) and from
// domains (moving the inbox onto a verified custom domain).
import { admin, HttpError, SUPABASE_URL } from "./core.ts";
import { openmail, OpenMailError, type OMInbox } from "./openmail.ts";

function slug(s: string | null | undefined) {
  return (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function mailboxCandidates(first: string, company: string) {
  const base = [slug(first), slug(company)].filter(Boolean).join("-").slice(0, 24).replace(/-+$/, "") || "founder";
  const padded = base.length >= 3 ? base : `${base}-hq`;
  const rand = () => Math.floor(100 + Math.random() * 900);
  return [padded, `${padded}-${rand()}`, `${padded}-${rand()}`, `founder-${crypto.randomUUID().slice(0, 8)}`];
}

export async function ensurePod(userId: string, label: string): Promise<string | undefined> {
  try {
    const pod = await openmail<{ id: string }>("/v1/pods", { body: { clientId: userId, name: label.slice(0, 200) } });
    return pod.id;
  } catch (err) {
    if (err instanceof OpenMailError && err.status === 409) {
      const pod = await openmail<{ id: string }>(`/v1/pods/${encodeURIComponent(userId)}`);
      return pod.id;
    }
    // Pods are an isolation nicety; fall back to the default pod rather than blocking signup.
    console.warn("pod creation failed, using default pod", err);
    return undefined;
  }
}

async function founderNames(ownerId: string, email?: string | null) {
  const [{ data: profile }, { data: startup }] = await Promise.all([
    admin.from("profiles").select("first_name,last_name,email").eq("id", ownerId).single(),
    admin.from("startups").select("name,domain").eq("owner_id", ownerId).single(),
  ]);
  const first = profile?.first_name ?? (email ?? profile?.email)?.split("@")[0] ?? "founder";
  const company = startup?.name ?? startup?.domain?.split(".")[0] ?? "";
  const person = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || first;
  return { first, company, person, displayName: company ? `${person} at ${company}` : person, email: email ?? profile?.email ?? "" };
}

function limitError(err: unknown) {
  return err instanceof OpenMailError && /maximum|limit|plan/i.test(err.message);
}

/** Creates the OpenMail inbox and stores its webhook secret. Tries each mailbox name until one is free. */
async function createInbox(ownerId: string, names: string[], opts: { displayName: string; podId?: string; domain?: string }) {
  let lastError: unknown;
  for (const mailboxName of names) {
    try {
      const inbox = await openmail<OMInbox>("/v1/inboxes", {
        body: {
          mailboxName,
          displayName: opts.displayName,
          webhookUrl: `${SUPABASE_URL}/functions/v1/openmail-webhook`,
          ...(opts.podId ? { podId: opts.podId } : {}),
          ...(opts.domain ? { domain: opts.domain } : {}),
        },
      });
      if (inbox.webhookSecret) await admin.rpc("store_inbox_secret", { p_inbox_id: inbox.id, p_secret: inbox.webhookSecret });
      return inbox;
    } catch (err) {
      lastError = err;
      if (limitError(err)) break;
      if (!(err instanceof OpenMailError && (err.status === 409 || err.status === 400))) throw err;
    }
  }
  if (limitError(lastError)) {
    console.error("OpenMail inbox limit reached", lastError);
    throw new HttpError(409, "We could not create your inbox just now. We have been notified and will set it up shortly.");
  }
  throw lastError ?? new Error("Could not create an inbox");
}

/** True when the stored inbox still exists on the current OpenMail account (it may predate an account move). */
async function stillExists(openmailInboxId: string) {
  try {
    await openmail(`/v1/inboxes/${openmailInboxId}`);
    return true;
  } catch (err) {
    if (err instanceof OpenMailError && (err.status === 404 || err.status === 403)) return false;
    return true; // network trouble is not proof it is gone
  }
}

export async function provisionInbox(owner: { id: string; email?: string | null }) {
  const { data: existing } = await admin
    .from("inboxes")
    .select("*")
    .eq("owner_id", owner.id)
    .eq("status", "active")
    .maybeSingle();
  if (existing) {
    if (await stillExists(existing.openmail_inbox_id)) return { inbox: existing, created: false };
    await admin.from("inboxes").update({ status: "retired", retired_at: new Date().toISOString() }).eq("id", existing.id);
  }

  const n = await founderNames(owner.id, owner.email);
  const podId = await ensurePod(owner.id, `${n.company || n.person} (${n.email})`);
  const inbox = await createInbox(owner.id, mailboxCandidates(n.first, n.company), { displayName: n.displayName, podId });

  const { data: row, error } = await admin
    .from("inboxes")
    .insert({
      owner_id: owner.id,
      openmail_inbox_id: inbox.id,
      openmail_pod_id: inbox.podId ?? podId ?? null,
      address: inbox.address,
      display_name: inbox.displayName ?? n.displayName,
    })
    .select()
    .single();
  if (error) throw error;

  return { inbox: row, created: true };
}

/**
 * Moves a founder onto a new inbox at their verified custom domain. The old inbox is retired: it stops
 * sending, but replies to it still arrive and its threads stay readable.
 */
export async function moveInboxToDomain(ownerId: string, domain: string, mailbox: string, podId: string | undefined) {
  const n = await founderNames(ownerId);
  const inbox = await createInbox(ownerId, [mailbox], { displayName: n.displayName, podId, domain });

  const now = new Date().toISOString();
  const { data: old } = await admin.from("inboxes").select("id").eq("owner_id", ownerId).eq("status", "active");
  const oldIds = (old ?? []).map((r) => r.id);
  if (oldIds.length) await admin.from("inboxes").update({ status: "retired", retired_at: now }).in("id", oldIds);

  const { data: row, error } = await admin
    .from("inboxes")
    .insert({
      owner_id: ownerId,
      openmail_inbox_id: inbox.id,
      openmail_pod_id: inbox.podId ?? podId ?? null,
      address: inbox.address,
      display_name: inbox.displayName ?? n.displayName,
      domain,
    })
    .select()
    .single();
  if (error) {
    // Put the previous inbox back so the founder is never left without one.
    if (oldIds.length) await admin.from("inboxes").update({ status: "active", retired_at: null }).in("id", oldIds);
    throw error;
  }
  return row;
}

/** Sending, follow-ups, reveals and exports come with a paid plan, not the trial. */
export async function hasPaidPlan(ownerId: string) {
  const { data } = await admin.from("subscriptions").select("status").eq("owner_id", ownerId).maybeSingle();
  return data?.status === "active" || data?.status === "past_due";
}

/** The inbox and custom domain come with the trial (card on file), so they need a started trial or a plan. */
export async function hasStartedPlan(ownerId: string) {
  const { data } = await admin.from("subscriptions").select("status").eq("owner_id", ownerId).maybeSingle();
  return data?.status === "trialing" || data?.status === "active" || data?.status === "past_due";
}
