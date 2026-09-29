// Billing actions for the signed-in founder: start a Stripe Checkout for a plan, or open the
// Stripe customer portal to change card, switch plan or cancel.
import { admin, HttpError, json, readJson, requireUser, secret, serve } from "../_shared/core.ts";
import { stripe, type StripePrice } from "../_shared/stripe.ts";

interface Body {
  action?: "checkout" | "portal";
  plan?: string;
}

/** Finds the plan's monthly price by lookup key, creating the product and price on first use. */
async function priceFor(plan: { id: string; name: string; price_gbp: number; stripe_lookup_key: string }) {
  const found = await stripe<{ data: StripePrice[] }>("/prices", { body: { "lookup_keys[]": plan.stripe_lookup_key, active: true, limit: 1 } });
  if (found.data[0]) return found.data[0].id;
  const product = await stripe<{ id: string }>("/products", {
    body: { name: `Centrale ${plan.name}`, metadata: { plan_id: plan.id } },
    idempotencyKey: `product-${plan.stripe_lookup_key}`,
  });
  const price = await stripe<StripePrice>("/prices", {
    body: {
      product: product.id,
      currency: "gbp",
      unit_amount: plan.price_gbp * 100,
      recurring: { interval: "month" },
      lookup_key: plan.stripe_lookup_key,
      transfer_lookup_key: true,
      metadata: { plan_id: plan.id },
    },
    idempotencyKey: `price-${plan.stripe_lookup_key}-${plan.price_gbp}`,
  });
  return price.id;
}

async function customerFor(uid: string, email: string | undefined) {
  const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id").eq("owner_id", uid).maybeSingle();
  if (sub?.stripe_customer_id) return sub.stripe_customer_id as string;
  const customer = await stripe<{ id: string }>("/customers", {
    body: { email, metadata: { owner_id: uid } },
    idempotencyKey: `customer-${uid}`,
  });
  await admin.from("subscriptions").upsert({ owner_id: uid, stripe_customer_id: customer.id }, { onConflict: "owner_id" });
  return customer.id;
}

serve(async (req) => {
  const user = await requireUser(req);
  const input = await readJson<Body>(req);
  const appUrl = await secret("APP_URL").catch(() => "http://localhost:3000");

  if (input.action === "portal") {
    const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id").eq("owner_id", user.id).maybeSingle();
    if (!sub?.stripe_customer_id) throw new HttpError(400, "Choose a plan first");
    const session = await stripe<{ url: string }>("/billing_portal/sessions", {
      body: { customer: sub.stripe_customer_id, return_url: `${appUrl}/dashboard/billing` },
    });
    return json({ url: session.url });
  }

  if (input.action === "checkout") {
    const { data: plan } = await admin.from("plans").select("*").eq("id", input.plan ?? "").maybeSingle();
    if (!plan?.stripe_lookup_key) throw new HttpError(400, "Pick a paid plan");
    const [price, customer, { data: current }] = await Promise.all([
      priceFor(plan),
      customerFor(user.id, user.email),
      admin.from("subscriptions").select("status, trial_ends_at").eq("owner_id", user.id).maybeSingle(),
    ]);

    // Founders who pay during the free trial keep the rest of it: billing starts when it would have ended.
    // Stripe needs a trial end at least two days out, so a trial ending sooner starts billing now.
    const trialEnd = current?.status === "trialing" && current.trial_ends_at ? Math.floor(new Date(current.trial_ends_at).getTime() / 1000) : 0;
    const keepTrial = trialEnd > Date.now() / 1000 + 2 * 86_400;

    const session = await stripe<{ url: string }>("/checkout/sessions", {
      body: {
        mode: "subscription",
        customer,
        client_reference_id: user.id,
        line_items: [{ price, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${appUrl}/dashboard/billing?checkout=success`,
        cancel_url: `${appUrl}/dashboard/billing?checkout=cancelled`,
        subscription_data: {
          metadata: { owner_id: user.id, plan_id: plan.id },
          ...(keepTrial ? { trial_end: trialEnd } : {}),
        },
      },
    });
    return json({ url: session.url });
  }

  throw new HttpError(400, "Unknown action");
});
