import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type Ingredient = {
  name: string;
  amount: number;
  unit: string;
  note?: string;
};

export type RecipeStep = {
  title: string;
  body: string;
  durationMin?: number;
};

export const RECIPE_STATUSES = ["draft", "published"] as const;
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

export const DIFFICULTIES = ["쉬움", "보통", "어려움"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// A recipe is edited as one document in the admin, so the ordered lists
// (ingredients, steps, tips...) live in JSONB columns and are validated by
// zod on every write (see src/lib/recipe-schema.ts).
export const recipes = pgTable(
  "recipes",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    titleOriginal: text("title_original"),
    summary: text("summary").notNull(),
    story: text("story"),
    category: text("category").notNull(),
    difficulty: text("difficulty").$type<Difficulty>().notNull(),
    yieldQuantity: integer("yield_quantity").notNull(),
    yieldUnit: text("yield_unit").notNull(),
    moldNote: text("mold_note"),
    prepMin: integer("prep_min").notNull(),
    restMin: integer("rest_min").notNull().default(0),
    bakeMin: integer("bake_min").notNull(),
    totalMin: integer("total_min").notNull(),
    ovenTempC: integer("oven_temp_c").notNull(),
    ovenMode: text("oven_mode").notNull(),
    ovenNote: text("oven_note"),
    equipment: jsonb("equipment").$type<string[]>().notNull().default([]),
    ingredients: jsonb("ingredients").$type<Ingredient[]>().notNull(),
    steps: jsonb("steps").$type<RecipeStep[]>().notNull(),
    tips: jsonb("tips").$type<string[]>().notNull().default([]),
    storage: text("storage"),
    variations: jsonb("variations").$type<string[]>().notNull().default([]),
    status: text("status").$type<RecipeStatus>().notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("recipes_slug_key").on(t.slug),
    index("recipes_status_published_at_idx").on(t.status, t.publishedAt),
    check("recipes_status_check", sql`${t.status} in ('draft', 'published')`),
    check("recipes_difficulty_check", sql`${t.difficulty} in ('쉬움', '보통', '어려움')`),
  ],
);

export const adminUsers = pgTable(
  "admin_users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("admin_users_email_key").on(sql`lower(${t.email})`)],
);

// Only the SHA-256 of the session token is stored, so a database leak does
// not hand out live sessions.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId), index("sessions_expires_at_idx").on(t.expiresAt)],
);

// Kept in Postgres (not process memory) so login throttling holds across
// every ECS task behind the load balancer.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ip: text("ip").notNull(),
    email: text("email").notNull(),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_ip_created_at_idx").on(t.ip, t.createdAt),
    index("login_attempts_email_created_at_idx").on(t.email, t.createdAt),
  ],
);

export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type AdminUser = typeof adminUsers.$inferSelect;
