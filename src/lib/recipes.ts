import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "./db";
import { recipes, type Recipe, type RecipeStatus } from "./db/schema";
import type { RecipeInput } from "./recipe-schema";

export type RecipeSummary = Pick<
  Recipe,
  "id" | "slug" | "title" | "titleOriginal" | "summary" | "category" | "difficulty" | "totalMin" | "yieldQuantity" | "yieldUnit"
>;

const summaryColumns = {
  id: recipes.id,
  slug: recipes.slug,
  title: recipes.title,
  titleOriginal: recipes.titleOriginal,
  summary: recipes.summary,
  category: recipes.category,
  difficulty: recipes.difficulty,
  totalMin: recipes.totalMin,
  yieldQuantity: recipes.yieldQuantity,
  yieldUnit: recipes.yieldUnit,
};

// ---- public reads -------------------------------------------------------
// Public pages render per request and are cached by CloudFront (see
// next.config.ts), so these always read the current database state.

export async function listPublishedRecipes(): Promise<RecipeSummary[]> {
  return getDb()
    .select(summaryColumns)
    .from(recipes)
    .where(eq(recipes.status, "published"))
    .orderBy(desc(recipes.publishedAt), desc(recipes.id));
}

// React cache(): generateMetadata and the page share one query per request.
export const getPublishedRecipe = cache(async (slug: string): Promise<Recipe | null> => {
  const [row] = await getDb()
    .select()
    .from(recipes)
    .where(and(eq(recipes.slug, slug), eq(recipes.status, "published")))
    .limit(1);
  return row ?? null;
});

export async function listPublishedForSitemap(): Promise<{ slug: string; updatedAt: Date }[]> {
  return getDb()
    .select({ slug: recipes.slug, updatedAt: recipes.updatedAt })
    .from(recipes)
    .where(eq(recipes.status, "published"));
}

// ---- admin --------------------------------------------------------------

export async function listAllRecipes() {
  return getDb()
    .select({ ...summaryColumns, status: recipes.status, updatedAt: recipes.updatedAt })
    .from(recipes)
    .orderBy(desc(recipes.updatedAt));
}

export async function getRecipeById(id: number): Promise<Recipe | null> {
  const [row] = await getDb().select().from(recipes).where(eq(recipes.id, id)).limit(1);
  return row ?? null;
}

export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`slug "${slug}" is already used`);
  }
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

export async function createRecipe(input: RecipeInput, status: RecipeStatus): Promise<number> {
  try {
    const [row] = await getDb()
      .insert(recipes)
      .values({ ...input, status, publishedAt: status === "published" ? new Date() : null })
      .returning({ id: recipes.id });
    return row.id;
  } catch (err) {
    if (isUniqueViolation(err)) throw new SlugTakenError(input.slug);
    throw err;
  }
}

export async function updateRecipe(id: number, input: RecipeInput): Promise<boolean> {
  try {
    const rows = await getDb()
      .update(recipes)
      .set({ ...input, ...clearedOptionalFields(input), updatedAt: new Date() })
      .where(eq(recipes.id, id))
      .returning({ id: recipes.id });
    return rows.length > 0;
  } catch (err) {
    if (isUniqueViolation(err)) throw new SlugTakenError(input.slug);
    throw err;
  }
}

// Drizzle skips `undefined` in UPDATE ... SET, so an optional field the admin
// emptied would silently keep its old text. Write NULL explicitly instead.
function clearedOptionalFields(input: RecipeInput) {
  return {
    titleOriginal: input.titleOriginal ?? null,
    story: input.story ?? null,
    moldNote: input.moldNote ?? null,
    ovenNote: input.ovenNote ?? null,
    storage: input.storage ?? null,
  };
}

export async function setRecipeStatus(id: number, status: RecipeStatus): Promise<string | null> {
  const [row] = await getDb()
    .update(recipes)
    .set({
      status,
      updatedAt: new Date(),
      // Keep the first publication date when re-publishing.
      publishedAt: status === "published" ? sql`coalesce(${recipes.publishedAt}, now())` : recipes.publishedAt,
    })
    .where(eq(recipes.id, id))
    .returning({ slug: recipes.slug });
  return row?.slug ?? null;
}

export async function deleteRecipe(id: number): Promise<string | null> {
  const [row] = await getDb().delete(recipes).where(eq(recipes.id, id)).returning({ slug: recipes.slug });
  return row?.slug ?? null;
}

/** Converts a DB row back into the editable shape used by the admin form. */
export function toRecipeInput(recipe: Recipe): RecipeInput {
  return {
    slug: recipe.slug,
    title: recipe.title,
    titleOriginal: recipe.titleOriginal ?? undefined,
    summary: recipe.summary,
    story: recipe.story ?? undefined,
    category: recipe.category,
    difficulty: recipe.difficulty,
    yieldQuantity: recipe.yieldQuantity,
    yieldUnit: recipe.yieldUnit,
    moldNote: recipe.moldNote ?? undefined,
    prepMin: recipe.prepMin,
    restMin: recipe.restMin,
    bakeMin: recipe.bakeMin,
    totalMin: recipe.totalMin,
    ovenTempC: recipe.ovenTempC,
    ovenMode: recipe.ovenMode,
    ovenNote: recipe.ovenNote ?? undefined,
    equipment: recipe.equipment,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    tips: recipe.tips,
    storage: recipe.storage ?? undefined,
    variations: recipe.variations,
  };
}
