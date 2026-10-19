import { defineConfig } from "drizzle-kit";

// Only used by `pnpm db:generate` to diff src/lib/db/schema.ts into SQL files
// under ./drizzle. Migrations are applied by scripts/migrate.ts, never by
// drizzle-kit push.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
