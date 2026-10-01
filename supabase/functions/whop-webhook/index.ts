// Receives Whop events and keeps public.subscriptions in step with the founder's membership.
// Subscribed events: membership.activated, membership.deactivated, membership.cancel_at_period_end_changed,
// membership.trial_ending_soon, payment.succeeded, payment.failed. Each one re-reads the membership from
// Whop, so the order events arrive in never matters. When a plan becomes paid the founder's inbox is created.
import { admin, json, secret, serve } from "../_shared/core.ts";
import { verifyWhopSignature, whop, type WhopMembership } from "../_shared/whop.ts";
import { hasPaidPlan, provisionInbox } from "../_shared/inbox.ts";

interface WhopEvent {
  id: string;
  type: string;
  data: Record<string, unknown> & { id?: string; membership?: { id?: string } | string | null; membership_id?: string };
}

/** Whop statuses mapped to ours. Null leaves the subscription as it is. */
function mapStatus(m: WhopMembership, current: string | null): string | null {
  switch (m.status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "canceling":
      // Still has access until the period ends.
      return current === "trialing" ? "trialing" : "active";
    case "past_due":
    case "unresolved":
      return "past_due";
    case "completed":
    case "canceled":
    case "expired":
      return "canceled";
    default:
      return null; // drafted: checkout started, not finished
  }
}

async function findOwner(m: WhopMembership) {
  const fromMeta = typeof m.metadata?.owner_id === "string" ? m.metadata.owner_id : null;
  if (fromMeta) return fromMeta;
  for (const [column, value] of [["whop_membership_id", m.id], ["whop_checkout_id", m.checkout_configuration_id]] as const) {
    if (!value) continue;
    const { data } = await admin.from("subscriptions").select("owner_id").eq(column, value).maybeSingle();
    if (data) return data.owner_id as string;
  }
  if (m.user?.email) {
    const { data } = await admin.from("profiles").select("id").ilike("email", m.user.email).maybeSingle();
    if (data) return data.id as string;
  }
  return null;
}

async function sync(m: WhopMembership) {
  const owner = await findOwner(m);
  if (!owner) return "no matching founder";

  const { data: current } = await admin.from("subscriptions").select("status").eq("owner_id", owner).maybeSingle();
  const status = mapStatus(m, current?.status ?? null);
  if (!status) return `ignored ${m.status}`;

  const { data: plan } = await admin.from("plans").select("id").eq("whop_plan_id", m.plan?.id ?? "").maybeSingle();
  const { error } = await admin.from("subscriptions").upsert(
    {
      owner_id: owner,
      plan_id: status === "canceled" ? "trial" : plan?.id ?? "monthly",
      status,
      trial_ends_at: status === "trialing" ? m.renewal_period_end : null,
      current_period_start: m.renewal_period_start ?? new Date().toISOString(),
      current_period_end: m.renewal_period_end,
      cancel_at_period_end: m.cancel_at_period_end,
      whop_membership_id: m.id,
      whop_user_id: m.user?.id ?? null,
      manage_url: m.manage_url,
    },
    { onConflict: "owner_id" },
  );
  if (error) throw error;

  // The trial has no inbox; a paid plan gets one straight away.
  if (await hasPaidPlan(owner)) {
    try {
      const { data: profile } = await admin.from("profiles").select("email").eq("id", owner).single();
      await provisionInbox({ id: owner, email: profile?.email });
    } catch (err) {
      // The founder can retry from Settings; the subscription is already saved.
      console.error("inbox provisioning after payment failed", err);
    }
  }
  return `synced ${status}`;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await req.text();
  const webhookSecret = await secret("WHOP_WEBHOOK_SECRET").catch(() => null);
  if (!webhookSecret) return json({ error: "Billing is not set up yet" }, 503);
  if (!(await verifyWhopSignature(raw, req.headers, webhookSecret))) return json({ error: "Invalid signature" }, 401);

  const event = JSON.parse(raw) as WhopEvent;
  const { data: fresh } = await admin.rpc("claim_webhook_event", { p_event_id: `whop:${event.id}` });
  if (!fresh) return json({ ok: true, duplicate: true });

  const d = event.data ?? {};
  const membershipId = event.type.startsWith("membership.")
    ? d.id
    : typeof d.membership === "string"
      ? d.membership
      : d.membership?.id ?? d.membership_id;
  if (!membershipId) return json({ ok: true, ignored: event.type });

  // The API copy is authoritative; fall back to the event body if the read fails.
  const membership = await whop<WhopMembership>(`/memberships/${membershipId}`).catch((err) => {
    console.error("membership read failed", err);
    return event.type.startsWith("membership.") && typeof d.status === "string" ? (d as unknown as WhopMembership) : null;
  });
  if (!membership) return json({ ok: true, ignored: "membership unavailable" });

  return json({ ok: true, result: await sync(membership) });
});
