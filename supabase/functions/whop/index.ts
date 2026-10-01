// Billing actions for the signed-in founder:
//   checkout  a Whop checkout for the monthly plan, tagged with the founder's id so the membership
//             maps back to this account whatever email they pay with
//   manage    where to change card or cancel (Whop's own membership page)
import { admin, HttpError, json, readJson, requireUser, secret, serve } from "../_shared/core.ts";
import { whop } from "../_shared/whop.ts";

const MANAGE_FALLBACK = "https://whop.com/@me/settings/memberships/";

serve(async (req) => {
  const user = await requireUser(req);
  const { action } = await readJson<{ action?: "checkout" | "manage" }>(req);

  if (action === "manage") {
    const { data } = await admin.from("subscriptions").select("manage_url").eq("owner_id", user.id).maybeSingle();
    return json({ url: data?.manage_url ?? MANAGE_FALLBACK });
  }

  if (action === "checkout") {
    const { data: sub } = await admin.from("subscriptions").select("status").eq("owner_id", user.id).maybeSingle();
    if (sub?.status === "trialing" || sub?.status === "active" || sub?.status === "past_due") {
      throw new HttpError(409, "You already have a plan. Manage it from Billing.");
    }
    const { data: plan } = await admin.from("plans").select("whop_plan_id").eq("id", "monthly").single();
    if (!plan?.whop_plan_id) throw new HttpError(503, "The Centrale plan is not set up yet");
    const appUrl = await secret("APP_URL").catch(() => "http://localhost:3000");

    const checkout = await whop<{ id: string; purchase_url: string }>("/checkout_configurations", {
      body: {
        mode: "payment",
        plan_id: plan.whop_plan_id,
        redirect_url: `${appUrl}/start?checkout=done`,
        metadata: { owner_id: user.id, email: user.email ?? null },
      },
    });
    await admin.from("subscriptions").upsert({ owner_id: user.id, whop_checkout_id: checkout.id }, { onConflict: "owner_id" });
    const url = checkout.purchase_url.startsWith("http") ? checkout.purchase_url : `https://whop.com${checkout.purchase_url}`;
    return json({ url });
  }

  throw new HttpError(400, "Unknown action");
});
