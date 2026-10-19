/**
 * Inserts the bundled recipes (currently only the financier) and publishes
 * them. Existing slugs are left untouched so admin edits survive re-seeding.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { seedRecipes } from "../src/content/recipes/financier";
import { poolConfigFromEnv } from "../src/lib/db/config";
import { recipes } from "../src/lib/db/schema";
import { recipeInputSchema } from "../src/lib/recipe-schema";
import { loadLocalEnv, log } from "./lib/env";

async function main() {
  loadLocalEnv();
  const client = new Client(poolConfigFromEnv());
  await client.connect();
  try {
    const db = drizzle(client);
    for (const raw of seedRecipes) {
      const input = recipeInputSchema.parse(raw);
      const inserted = await db
        .insert(recipes)
        .values({ ...input, status: "published", publishedAt: new Date() })
        .onConflictDoNothing({ target: recipes.slug })
        .returning({ id: recipes.id });
      log(inserted.length ? "seeded recipe" : "recipe already exists, skipped", { slug: input.slug });
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ level: "error", msg: "seed failed", err: String(err?.stack ?? err) }));
  process.exit(1);
});
