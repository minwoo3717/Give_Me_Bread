import type { MetadataRoute } from "next";
import { listPublishedForSitemap } from "@/lib/recipes";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl();
  const recipes = await listPublishedForSitemap();
  const latest = recipes.reduce<Date | undefined>(
    (max, r) => (!max || r.updatedAt > max ? r.updatedAt : max),
    undefined,
  );
  return [
    { url: `${origin}/`, lastModified: latest, changeFrequency: "weekly", priority: 1 },
    ...recipes.map((r) => ({
      url: `${origin}/recipes/${r.slug}`,
      lastModified: r.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
