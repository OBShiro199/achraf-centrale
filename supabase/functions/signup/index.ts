// Creates a pre-confirmed account so founders can go straight into onboarding.
// The client signs in with the same password right after this returns.
// Refuses throwaway email services and more than 3 accounts a day from one network (testers excepted).
import { admin, HttpError, json, readJson, serve } from "../_shared/core.ts";
import { isDisposable } from "../_shared/disposable.ts";

/** The caller's IP, hashed with a server-side salt so the raw address is never stored. */
async function ipHash(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const salt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const { email, password } = await readJson<{ email?: string; password?: string }>(req);

  const cleanEmail = email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new HttpError(400, "Enter a valid email address");
  if (!password || password.length < 8) throw new HttpError(400, "Use at least 8 characters for your password");
  if (isDisposable(cleanEmail)) throw new HttpError(400, "Use your work or personal email. Temporary inboxes cannot open an account.");

  const hash = await ipHash(req);
  const { data: refusal, error: checkError } = await admin.rpc("signup_check", { p_ip_hash: hash, p_email: cleanEmail });
  if (checkError) throw checkError;
  if (refusal) throw new HttpError(429, refusal as string);

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
  await admin.rpc("signup_record", { p_ip_hash: hash, p_email: cleanEmail });
  return json({ ok: true });
});
