// Matches a founder with their first 10 investors at the end of onboarding (and again from the Investors page).
// One database call, public.match_onboarding: investors tagged with the founder's round who can be emailed,
// one per firm, ranked by sector and keyword fit, saved with a reason each. No Claude call, so it is instant,
// free and cannot time out.
import { admin, json, requireUser, serve } from "../_shared/core.ts";

serve(async (req) => {
  const user = await requireUser(req);
  await admin.from("startups").update({ matches_status: "running" }).eq("owner_id", user.id);
  const { data: count, error } = await admin.rpc("match_onboarding", { p_uid: user.id, p_count: 10 });
  if (error) {
    await admin.from("startups").update({ matches_status: "error" }).eq("owner_id", user.id);
    throw error;
  }
  return json({ ok: true, count: Number(count ?? 0) });
});
