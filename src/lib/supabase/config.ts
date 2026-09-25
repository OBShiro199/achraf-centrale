// Public Supabase settings. Both values ship to every browser, so defaults here are safe and
// keep builds working when a host (Vercel) has no env vars set. Env vars still take priority.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tldvqiqucfmlnkgxaufy.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_CwTEl8T1laIvXu4rJGRWMg_Nv7O6gJR";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
