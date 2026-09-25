// Scrapes the founder's homepage with Firecrawl and stores the result on their startup.
import { admin, HttpError, json, normaliseDomain, readJson, requireUser, secret, serve } from "../_shared/core.ts";

interface FirecrawlResponse {
  success: boolean;
  error?: string;
  data?: {
    markdown?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
  };
}

function cleanSiteName(title: string, domain: string): string {
  const base = domain.split(".")[0];
  const pretty = base.charAt(0).toUpperCase() + base.slice(1);
  if (!title) return pretty;
  // "Acme | Tools for X" or "Acme: X" -> "Acme"
  const first = title.split(/\s[|–—:-]\s|\s·\s/)[0].trim();
  return first.length > 0 && first.length <= 40 ? first : pretty;
}

serve(async (req) => {
  const user = await requireUser(req);
  const { domain: raw } = await readJson<{ domain?: string }>(req);
  if (!raw) throw new HttpError(400, "Enter your domain");
  const domain = normaliseDomain(raw);
  const url = `https://${domain}`;

  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await secret("FIRECRAWL_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "summary"],
      onlyMainContent: true,
      timeout: 45000,
    }),
  });
  const body = (await res.json()) as FirecrawlResponse;

  const faviconFallback = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  if (!res.ok || !body.success || !body.data) {
    // Keep going without a scrape: the profile step can still run on answers alone.
    await admin
      .from("startups")
      .update({ domain, website_url: url, favicon_url: faviconFallback, scrape: { error: body.error ?? `HTTP ${res.status}` } })
      .eq("owner_id", user.id);
    return json({ ok: false, domain, favicon: faviconFallback, error: "We could not read that site, we will build from your answers." });
  }

  const meta = body.data.metadata ?? {};
  const title = String(meta.ogSiteName ?? meta.title ?? "");
  const description = String(meta.description ?? meta.ogDescription ?? "");
  const favicon = typeof meta.favicon === "string" && meta.favicon.startsWith("http") ? meta.favicon : faviconFallback;
  const name = cleanSiteName(title, domain);

  const scrape = {
    url,
    title,
    description,
    favicon,
    summary: body.data.summary ?? null,
    markdown: body.data.markdown ?? "",
    scraped_at: new Date().toISOString(),
  };

  const { data: existing } = await admin.from("startups").select("name").eq("owner_id", user.id).single();

  await admin
    .from("startups")
    .update({
      domain,
      website_url: url,
      favicon_url: favicon,
      scrape,
      ...(existing?.name ? {} : { name }),
    })
    .eq("owner_id", user.id);

  return json({ ok: true, domain, name, title, description, favicon, summary: scrape.summary });
});
