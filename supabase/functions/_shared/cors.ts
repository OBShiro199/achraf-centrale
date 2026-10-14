// Browsers may call the edge functions only from Centrale itself: the live site, its Vercel deployments and
// local development. Other sites get no Access-Control-Allow-Origin, so browsers refuse their requests.
const ALLOWED_ORIGINS = new Set(["https://www.centralegtm.com", "https://centralegtm.com", "https://achraf-centrale.vercel.app"]);
const ALLOWED_PATTERNS = [/^https:\/\/achraf-centrale[a-z0-9-]*\.vercel\.app$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

export function allowedOrigin(origin: string | null) {
  if (!origin) return null;
  return ALLOWED_ORIGINS.has(origin) || ALLOWED_PATTERNS.some((p) => p.test(origin)) ? origin : null;
}
