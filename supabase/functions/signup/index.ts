// Creates a pre-confirmed account so founders can go straight into onboarding.
// The client signs in with the same password right after this returns.
import { admin, HttpError, json, readJson, serve } from "../_shared/core.ts";

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const { email, password } = await readJson<{ email?: string; password?: string }>(req);

  const cleanEmail = email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new HttpError(400, "Enter a valid email address");
  if (!password || password.length < 8) throw new HttpError(400, "Use at least 8 characters for your password");

  const { error } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
  });

  if (error) {
    if (error.status === 422 || /already/i.test(error.message)) {
      throw new HttpError(409, "An account with this email already exists. Log in instead.");
    }
    throw new HttpError(400, error.message);
  }
  return json({ ok: true });
});
