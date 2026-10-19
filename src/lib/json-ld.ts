import type { Recipe } from "./db/schema";
import { formatIngredient, isoDuration } from "./format";
import { SITE_NAME } from "./site";

/** schema.org/Recipe for Google rich results. */
export function recipeJsonLd(recipe: Recipe, origin: string) {
  const url = `${origin}/recipes/${recipe.slug}`;
  // Ingredients that are not part of the dough itself (e.g. butter for the
  // mold) are still listed: they are on the shopping list.
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    alternateName: recipe.titleOriginal ?? undefined,
    description: recipe.summary,
    url,
    image: [`${origin}/opengraph-image`],
    author: { "@type": "Organization", name: SITE_NAME, url: origin },
    publisher: { "@type": "Organization", name: SITE_NAME, url: origin },
    datePublished: recipe.publishedAt?.toISOString(),
    dateModified: recipe.updatedAt.toISOString(),
    recipeCategory: recipe.category,
    recipeYield: [String(recipe.yieldQuantity), `${recipe.yieldQuantity}${recipe.yieldUnit}`],
    prepTime: isoDuration(recipe.prepMin + recipe.restMin),
    cookTime: isoDuration(recipe.bakeMin),
    totalTime: isoDuration(recipe.totalMin),
    tool: recipe.equipment.map((name) => ({ "@type": "HowToTool", name })),
    recipeIngredient: recipe.ingredients.map(formatIngredient),
    recipeInstructions: recipe.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.body,
      url: `${url}#step-${index + 1}`,
    })),
    inLanguage: "ko-KR",
  };
}

/** Serializes JSON-LD for a <script> tag without letting "</script>" break out. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
