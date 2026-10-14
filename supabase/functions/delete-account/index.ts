// Deletes the signed-in founder's account and data. POST { confirm: "delete my account" }.
// Refuses while a paid plan is still set to renew, so nobody is charged for an account that no longer exists.
// Order: OpenMail inboxes and domains, then stored files, then rows without a foreign key, then the auth
// user (which cascades to every founder table).
import { admin, HttpError, json, readJson, requireUser, serve } from "../_shared/core.ts";
import { openmail, OpenMailError } from "../_shared/openmail.ts";

const PHRASE = "delete my account";

async function removeFolder(bucket: string, folder: string) {
  for (let round = 0; round < 50; round++) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100 });
    if (error) throw error;
    if (!data?.length) return;
    const { error: rmError } = await admin.storage.from(bucket).remove(data.map((f) => `${folder}/${f.name}`));
    if (rmError) throw rmError;
    if (data.length < 100) return;
  }
}

async function openmailDelete(path: string) {
  try {
    await openmail(path, { method: "DELETE" });
  } catch (err) {
    // Already gone, or on an older OpenMail account: nothing left to remove.
    if (!(err instanceof OpenMailError && (err.status === 404 || err.status === 403))) console.warn("OpenMail delete failed", path, err);
  }
}

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Use POST");
  const user = await requireUser(req);
  const { confirm } = await readJson<{ confirm?: string }>(req);
  if (confirm?.trim().toLowerCase() !== PHRASE) throw new HttpError(400, `Type "${PHRASE}" to confirm.`);

  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, cancel_at_period_end, whop_membership_id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (sub?.whop_membership_id && ["trialing", "active", "past_due"].includes(sub.status) && !sub.cancel_at_period_end) {
    throw new HttpError(409, "Cancel your plan in Billing first, so you are not charged again. Then delete your account.");
  }

  const [{ data: inboxes }, { data: domains }] = await Promise.all([
    admin.from("inboxes").select("openmail_inbox_id").eq("owner_id", user.id),
    admin.from("sending_domains").select("openmail_domain_id").eq("owner_id", user.id).neq("status", "removed"),
  ]);
  for (const i of inboxes ?? []) await openmailDelete(`/v1/inboxes/${i.openmail_inbox_id}`);
  for (const d of domains ?? []) if (d.openmail_domain_id) await openmailDelete(`/v1/domains/${d.openmail_domain_id}`);

  await removeFolder("decks", user.id);
  await removeFolder("brand", user.id);

  const { error: forgetError } = await admin.rpc("forget_owner", { p_uid: user.id });
  if (forgetError) throw forgetError;
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  return json({ ok: true });
});
