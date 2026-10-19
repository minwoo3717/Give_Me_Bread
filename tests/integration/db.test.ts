/**
 * Runs against a real Postgres that has been migrated and seeded
 * (`pnpm db:migrate && pnpm db:seed`; CI does this before `pnpm test`).
 * Skipped when DATABASE_URL is not set.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("database integration", async () => {
  const { getDb } = await import("@/lib/db");
  const { loginAttempts } = await import("@/lib/db/schema");
  const recipes = await import("@/lib/recipes");
  const rateLimit = await import("@/lib/auth/rate-limit");

  const cleanupEmails: string[] = [];
  afterAll(async () => {
    for (const email of cleanupEmails) {
      await getDb().delete(loginAttempts).where(eq(loginAttempts.email, email));
    }
    const pool = (globalThis as unknown as { __ovenNotePool?: Pool }).__ovenNotePool;
    await pool?.end();
  });

  function freshEmail() {
    const email = `attacker-${randomUUID()}@example.com`;
    cleanupEmails.push(email);
    return email;
  }

  it("lists the seeded financier as published", async () => {
    const list = await recipes.listPublishedRecipes();
    expect(list.map((r) => r.slug)).toContain("financier");
  });

  it("loads a published recipe with its JSONB lists intact", async () => {
    const recipe = await recipes.getPublishedRecipe("financier");
    expect(recipe?.title).toBe("휘낭시에");
    expect(recipe?.ingredients.length).toBeGreaterThan(5);
    expect(recipe?.steps[0].title).toBeTruthy();
  });

  it("hides drafts from public reads and shows them again when published", async () => {
    const slug = `test-${randomUUID().slice(0, 8)}`;
    const financier = (await recipes.getPublishedRecipe("financier"))!;
    const id = await recipes.createRecipe({ ...recipes.toRecipeInput(financier), slug }, "draft");
    try {
      expect(await recipes.getPublishedRecipe(slug)).toBeNull();
      await recipes.setRecipeStatus(id, "published");
      expect((await recipes.getPublishedRecipe(slug))?.id).toBe(id);
    } finally {
      await recipes.deleteRecipe(id);
    }
  });

  it("clears optional text the admin emptied (writes NULL, not 'unchanged')", async () => {
    const slug = `test-${randomUUID().slice(0, 8)}`;
    const financier = (await recipes.getPublishedRecipe("financier"))!;
    const input = recipes.toRecipeInput(financier);
    const id = await recipes.createRecipe({ ...input, slug }, "draft");
    try {
      await recipes.updateRecipe(id, { ...input, slug, story: undefined, titleOriginal: undefined, storage: undefined });
      const row = await recipes.getRecipeById(id);
      expect(row?.story).toBeNull();
      expect(row?.titleOriginal).toBeNull();
      expect(row?.storage).toBeNull();
    } finally {
      await recipes.deleteRecipe(id);
    }
  });

  it("refuses a duplicate slug", async () => {
    const financier = (await recipes.getPublishedRecipe("financier"))!;
    await expect(recipes.createRecipe(recipes.toRecipeInput(financier), "draft")).rejects.toBeInstanceOf(
      recipes.SlugTakenError,
    );
  });

  it("lets exactly 5 of 20 concurrent guesses through for one email+network", async () => {
    const email = freshEmail();
    const gates = await Promise.all(
      Array.from({ length: 20 }, () => rateLimit.reserveLoginAttempt("198.51.100.7", email)),
    );
    expect(gates.filter((g) => g.allowed)).toHaveLength(rateLimit.MAX_FAILURES_PER_PAIR);
    const rows = await getDb().select().from(loginAttempts).where(eq(loginAttempts.email, email));
    expect(rows).toHaveLength(rateLimit.MAX_FAILURES_PER_PAIR);
  });

  it("keeps a network that logged in before usable when the per-email cap is reached", async () => {
    const email = freshEmail();
    const home = "192.0.2.77";
    const ok = await rateLimit.reserveLoginAttempt(home, email);
    expect(ok.allowed).toBe(true);
    if (ok.allowed) await rateLimit.completeLoginAttempt(ok.attemptId, email, true);

    // An attacker fills the per-email budget from 10 different networks.
    const networks = Math.ceil(rateLimit.MAX_FAILURES_PER_EMAIL / rateLimit.MAX_FAILURES_PER_PAIR);
    for (let n = 0; n < networks; n++) {
      for (let i = 0; i < rateLimit.MAX_FAILURES_PER_PAIR; i++) {
        await rateLimit.reserveLoginAttempt(`203.0.113.${n + 1}`, email);
      }
    }
    expect((await rateLimit.reserveLoginAttempt("198.51.100.200", email)).allowed).toBe(false);
    expect((await rateLimit.reserveLoginAttempt(home, email)).allowed).toBe(true);
  });

  it("does not let one attacker lock the account out for other networks", async () => {
    const email = freshEmail();
    for (let i = 0; i < rateLimit.MAX_FAILURES_PER_PAIR; i++) {
      const gate = await rateLimit.reserveLoginAttempt("203.0.113.9", email);
      expect(gate.allowed).toBe(true);
    }
    expect((await rateLimit.reserveLoginAttempt("203.0.113.9", email)).allowed).toBe(false);
    // The real admin, elsewhere, can still try.
    expect((await rateLimit.reserveLoginAttempt("192.0.2.44", email)).allowed).toBe(true);
  });

  it("does not let blocked retries extend the lockout, and a success clears it", async () => {
    const email = freshEmail();
    const ip = "198.51.100.8";
    for (let i = 0; i < rateLimit.MAX_FAILURES_PER_PAIR; i++) await rateLimit.reserveLoginAttempt(ip, email);
    for (let i = 0; i < 5; i++) expect((await rateLimit.reserveLoginAttempt(ip, email)).allowed).toBe(false);
    const failures = await getDb().select().from(loginAttempts).where(eq(loginAttempts.email, email));
    expect(failures).toHaveLength(rateLimit.MAX_FAILURES_PER_PAIR);

    const fromHome = await rateLimit.reserveLoginAttempt("192.0.2.45", email);
    expect(fromHome.allowed).toBe(true);
    if (fromHome.allowed) await rateLimit.completeLoginAttempt(fromHome.attemptId, email, true);
    expect((await rateLimit.reserveLoginAttempt(ip, email)).allowed).toBe(true);
  });
});
