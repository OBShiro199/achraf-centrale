// Gives a founder their own OpenMail inbox during onboarding, trial included. Idempotent.
// Sending from it still waits for the paid plan (see send-email and process-outbox).
import { HttpError, json, requireUser, serve } from "../_shared/core.ts";
import { hasStartedPlan, provisionInbox } from "../_shared/inbox.ts";

serve(async (req) => {
  const user = await requireUser(req);
  if (!(await hasStartedPlan(user.id))) {
    throw new HttpError(402, "Start your free trial to get your inbox.");
  }
  const { inbox, created } = await provisionInbox(user);
  return json({ ok: true, inbox, created });
});
