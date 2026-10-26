import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/supabase/config";

/** Public pages only; the dashboard is behind login. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/signup", "/login", "/terms", "/privacy"].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.5,
  }));
}
