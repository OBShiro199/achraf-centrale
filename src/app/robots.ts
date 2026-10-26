import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/supabase/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/onboarding", "/start", "/unsubscribe", "/remove"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
