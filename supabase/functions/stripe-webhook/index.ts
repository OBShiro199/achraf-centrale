// Receives Stripe events and keeps public.subscriptions in step: plan, status and billing period.
// Configure the endpoint in Stripe with: checkout.session.completed, customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed.
import { admin, json, secret, serve } from "../_shared/core.ts";
import { stripe, type StripeSubscription, verifyStripeSignature } from "../_shared/stripe.ts";

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

const PLAN_BY_LOOKUP: Record<string, string> = {
  centrale_starter_monthly: "starter",
  centrale_pro_monthly: "pro",
};

// Stripe's statuses mapped to ours. A Stripe "trialing" subscription is a paying customer whose
// first charge waits for the in-app trial to end, so it gets the paid plan now.
const STATUS: Record<StripeSubscription["status"], string | null> = {
  trialing: "active",
  active: "active",
  past_due: "past_due",
  unpaid: "past_due",
  paused: "past_due",
  canceled: "canceled",
  incomplete: null,
  incomplete_expired: null,
};

async function sync(sub: StripeSubscription) {
  const status = STATUS[sub.status];
  if (!status) return "ignored incomplete subscription";

  let owner = sub.metadata?.owner_id;
  if (!owner) {
    const { data } = await admin.from("subscriptions").select("owner_id").eq("stripe_customer_id", sub.customer).maybeSingle();
    owner = data?.owner_id;
  }
  if (!owner) return "no matching founder";

  const item = sub.items?.data?.[0];
  const plan = sub.metadata?.plan_id ?? PLAN_BY_LOOKUP[item?.price?.lookup_key ?? ""] ?? "starter";
  // Newer API versions put the period on the item; older ones on the subscription.
  const start = item?.current_period_start ?? sub.current_period_start;
  const end = item?.current_period_end ?? sub.current_period_end;

  const { error } = await admin.from("subscriptions").upsert(
    {
      owner_id: owner,
      // A cancelled subscription falls back to the (expired) trial plan, which keeps search but no credits.
      plan_id: status === "canceled" ? "trial" : plan,
      status,
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      cancel_at_period_end: sub.cancel_at_period_end,
      current_period_start: start ? new Date(start * 1000).toISOString() : new Date().toISOString(),
      current_period_end: end ? new Date(end * 1000).toISOString() : null,
    },
    { onConflict: "owner_id" },
  );
  if (error) throw error;
  return `synced ${plan} ${status}`;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await req.text();
  const endpointSecret = await secret("STRIPE_WEBHOOK_SECRET").catch(() => null);
  if (!endpointSecret) return json({ error: "Billing is not set up yet" }, 503);
  if (!(await verifyStripeSignature(raw, req.headers.get("Stripe-Signature"), endpointSecret))) {
    return json({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(raw) as StripeEvent;
  const { data: fresh } = await admin.rpc("claim_webhook_event", { p_event_id: `stripe:${event.id}` });
  if (!fresh) return json({ ok: true, duplicate: true });

  const obj = event.data.object;
  let result = "ignored";
  switch (event.type) {
    case "checkout.session.completed": {
      if (typeof obj.subscription === "string") {
        result = await sync(await stripe<StripeSubscription>(`/subscriptions/${obj.subscription}`));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      result = await sync(obj as unknown as StripeSubscription);
      break;
    case "invoice.payment_failed": {
      const subId = (obj.subscription ?? (obj.parent as { subscription_details?: { subscription?: string } })?.subscription_details?.subscription) as
        | string
        | undefined;
      if (subId) result = await sync(await stripe<StripeSubscription>(`/subscriptions/${subId}`));
      break;
    }
  }
  return json({ ok: true, result });
});
