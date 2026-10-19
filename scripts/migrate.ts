/**
 * Applies SQL migrations from ./drizzle, then (optionally) provisions the
 * least-privilege role the web app connects with.
 *
 * Production: runs as a one-off ECS task before every deploy, with the RDS
 * master credentials (DB_USER/DB_PASSWORD from the RDS-managed secret) and the
 * app credentials (APP_DB_USER/APP_DB_PASSWORD from the app secret).
 * Local: `pnpm db:migrate` with DATABASE_URL from .env.local.
 */
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { poolConfigFromEnv } from "../src/lib/db/config";
import { scramSha256Verifier } from "../src/lib/db/scram";
import { errorFields } from "../src/lib/logger";
import { loadLocalEnv, log } from "./lib/env";

const ROLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

async function main() {
  loadLocalEnv();
  const migrationsFolder = resolve(process.env.MIGRATIONS_DIR ?? "drizzle");
  const client = new Client(poolConfigFromEnv());
  await client.connect();
  try {
    // Serialize concurrent runs (e.g. two deploys racing): the second waits.
    await client.query("select pg_advisory_lock(727274)");
    log("applying migrations", { migrationsFolder });
    await migrate(drizzle(client), { migrationsFolder });
    log("migrations applied");

    const appUser = process.env.APP_DB_USER;
    const appPassword = process.env.APP_DB_PASSWORD;
    if (appUser && appPassword) {
      await ensureAppRole(client, appUser, appPassword);
    } else {
      log("APP_DB_USER/APP_DB_PASSWORD not set; skipping app role provisioning");
    }
  } finally {
    await client.query("select pg_advisory_unlock(727274)").catch(() => {});
    await client.end();
  }
}

async function ensureAppRole(client: Client, user: string, password: string) {
  if (!ROLE_NAME_PATTERN.test(user)) throw new Error(`Invalid APP_DB_USER: ${user}`);
  const ident = `"${user}"`;
  // Send a SCRAM verifier, never the cleartext (see src/lib/db/scram.ts).
  // It only contains [A-Za-z0-9+/=:$-], so it is safe inside a literal.
  const verifier = scramSha256Verifier(password);

  const { rowCount } = await client.query("select 1 from pg_roles where rolname = $1", [user]);
  if (rowCount === 0) {
    await client.query(`create role ${ident} login password '${verifier}'`);
    log("created app role", { user });
  } else {
    // Re-applying keeps the role in sync if the secret was rotated.
    await client.query(`alter role ${ident} with login password '${verifier}'`);
  }

  const { rows } = await client.query<{ db: string }>("select current_database() as db");
  const db = `"${rows[0].db.replace(/"/g, '""')}"`;
  await client.query(`grant connect on database ${db} to ${ident}`);
  await client.query(`grant usage on schema public to ${ident}`);
  await client.query(`grant select, insert, update, delete on all tables in schema public to ${ident}`);
  await client.query(`grant usage, select on all sequences in schema public to ${ident}`);
  // Tables created by future migrations (owned by the migrator) are covered too.
  await client.query(
    `alter default privileges in schema public grant select, insert, update, delete on tables to ${ident}`,
  );
  await client.query(`alter default privileges in schema public grant usage, select on sequences to ${ident}`);
  log("app role privileges ensured", { user });
}

main().catch((err) => {
  // errorFields drops bound SQL parameters (e.g. the new password hash).
  console.error(JSON.stringify({ level: "error", msg: "migration failed", ...errorFields(err) }));
  process.exit(1);
});
