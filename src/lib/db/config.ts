import { readFileSync } from "node:fs";
import type { PoolConfig } from "pg";

// Shared by the Next.js server and the bundled ops scripts (migrate, seed,
// create-admin), so it must not import "server-only".
//
// Two ways to configure the connection:
//   - DATABASE_URL (local development, CI)
//   - DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD (ECS, where the
//     password is injected from Secrets Manager)
// DB_SSL=require turns on TLS; DB_SSL_CA_PATH points at the RDS CA bundle so
// the server certificate is actually verified.
export function poolConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides: { user?: string; password?: string } = {},
): PoolConfig {
  const ssl = sslFromEnv(env);
  const base: PoolConfig = {
    max: intFromEnv(env.DB_POOL_MAX, 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: intFromEnv(env.DB_STATEMENT_TIMEOUT_MS, 10_000),
    application_name: env.DB_APPLICATION_NAME ?? "oven-note",
    ssl,
  };

  if (env.DATABASE_URL) {
    return { ...base, connectionString: env.DATABASE_URL, ...definedOnly(overrides) };
  }

  const host = env.DB_HOST;
  if (!host) {
    throw new Error("Database is not configured: set DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD");
  }
  return {
    ...base,
    host,
    port: intFromEnv(env.DB_PORT, 5432),
    database: env.DB_NAME ?? "bakery",
    user: overrides.user ?? env.DB_USER,
    password: overrides.password ?? env.DB_PASSWORD,
  };
}

function sslFromEnv(env: NodeJS.ProcessEnv): PoolConfig["ssl"] {
  if (env.DB_SSL !== "require") return undefined;
  const caPath = env.DB_SSL_CA_PATH;
  if (!caPath) return { rejectUnauthorized: true };
  return { rejectUnauthorized: true, ca: readFileSync(caPath, "utf8") };
}

function intFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
