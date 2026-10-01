// Gives a founder their own OpenMail inbox once their plan is paid. Idempotent.
import { HttpError, json, requireUser, serve } from "../_shared/core.ts";
import { hasPaidPlan, provisionInbox } from "../_shared/inbox.ts";

serve(async (req) => {
  const user = await requireUser(req);
  if (!(await hasPaidPlan(user.id))) {
    throw new HttpError(402, "Your sending inbox is set up when your plan starts, after the 7-day trial.");
  }
  const { inbox, created } = await provisionInbox(user);
  return json({ ok: true, inbox, created });
});
