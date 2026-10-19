import { describe, expect, it } from "vitest";
import { financier } from "@/content/recipes/financier";
import { fieldErrors, recipeInputSchema } from "@/lib/recipe-schema";

describe("recipeInputSchema", () => {
  it("accepts the bundled financier recipe", () => {
    const result = recipeInputSchema.safeParse(financier);
    expect(result.success).toBe(true);
  });

  it("financier batter math adds up to roughly 12 x 34 g", () => {
    // Raw butter 125 g browns down to the 100 g that goes in; the mold butter
    // is not part of the batter.
    const batter = financier.ingredients
      .filter((i) => !i.name.includes("틀 칠용"))
      .reduce((sum, i) => sum + (i.name === "무염버터" ? 100 : i.amount), 0);
    expect(batter).toBeGreaterThan(400);
    expect(batter / financier.yieldQuantity).toBeGreaterThan(33);
    expect(batter / financier.yieldQuantity).toBeLessThan(37);
  });

  it("coerces numeric strings from the admin form", () => {
    const parsed = recipeInputSchema.parse({ ...financier, prepMin: "45", ovenTempC: "190" });
    expect(parsed.prepMin).toBe(45);
    expect(parsed.ovenTempC).toBe(190);
  });

  it("turns empty optional text into undefined", () => {
    const parsed = recipeInputSchema.parse({ ...financier, story: "   ", titleOriginal: "" });
    expect(parsed.story).toBeUndefined();
    expect(parsed.titleOriginal).toBeUndefined();
  });

  it("rejects unsafe slugs", () => {
    for (const slug of ["Financier", "fin ancier", "../admin", "-financier", "휘낭시에"]) {
      expect(recipeInputSchema.safeParse({ ...financier, slug }).success, slug).toBe(false);
    }
  });

  it("reports nested field errors with dotted paths", () => {
    const result = recipeInputSchema.safeParse({
      ...financier,
      ingredients: [{ name: "", amount: -1, unit: "g" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors["ingredients.0.name"]).toBeDefined();
      expect(errors["ingredients.0.amount"]).toBeDefined();
    }
  });

  it("requires at least one ingredient and one step", () => {
    expect(recipeInputSchema.safeParse({ ...financier, ingredients: [] }).success).toBe(false);
    expect(recipeInputSchema.safeParse({ ...financier, steps: [] }).success).toBe(false);
  });
});
