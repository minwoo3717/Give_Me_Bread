import { describe, expect, it } from "vitest";
import { financier } from "@/content/recipes/financier";
import type { Recipe } from "@/lib/db/schema";
import { recipeJsonLd, serializeJsonLd } from "@/lib/json-ld";

const row: Recipe = {
  id: 1,
  ...financier,
  titleOriginal: financier.titleOriginal ?? null,
  story: financier.story ?? null,
  moldNote: financier.moldNote ?? null,
  ovenNote: financier.ovenNote ?? null,
  storage: financier.storage ?? null,
  status: "published",
  publishedAt: new Date("2026-10-19T00:00:00Z"),
  createdAt: new Date("2026-10-19T00:00:00Z"),
  updatedAt: new Date("2026-10-19T01:00:00Z"),
};

describe("recipeJsonLd", () => {
  const ld = recipeJsonLd(row, "https://example.cloudfront.net");

  it("has the fields Google requires and recommends", () => {
    expect(ld["@type"]).toBe("Recipe");
    expect(ld.name).toBe("휘낭시에");
    expect(ld.image).toHaveLength(1);
    expect(ld.totalTime).toBe("PT3H");
    expect(ld.cookTime).toBe("PT15M");
    expect(ld.prepTime).toBe("PT2H45M");
    expect(ld.recipeIngredient[0]).toBe("무염버터 125g");
    expect(ld.recipeInstructions).toHaveLength(financier.steps.length);
    expect(ld.recipeInstructions[0]).toMatchObject({ "@type": "HowToStep", position: 1 });
  });

  it("uses absolute URLs", () => {
    expect(ld.url).toBe("https://example.cloudfront.net/recipes/financier");
  });
});

describe("serializeJsonLd", () => {
  it("cannot be used to close the script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});
