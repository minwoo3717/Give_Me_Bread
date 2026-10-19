import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Dynamic so SITE_URL is read at runtime, not baked in at build time.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
