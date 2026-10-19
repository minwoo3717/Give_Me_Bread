import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { poolConfigFromEnv } from "./config";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

// One pool per server process. In development, module reloads would create a
// new pool on every edit, so the instance is parked on globalThis.
const globalForDb = globalThis as unknown as { __ovenNotePool?: Pool; __ovenNoteDb?: Db };

function createDb(): Db {
  const pool = new Pool(poolConfigFromEnv());
  pool.on("error", (err) => {
    // An idle client lost its connection (e.g. RDS failover). pg removes it
    // from the pool; log so it shows up in CloudWatch.
    console.error(JSON.stringify({ level: "error", msg: "pg pool error", err: err.message }));
  });
  globalForDb.__ovenNotePool = pool;
  return drizzle(pool, { schema });
}

export function getDb(): Db {
  globalForDb.__ovenNoteDb ??= createDb();
  return globalForDb.__ovenNoteDb;
}

export async function pingDb(timeoutMs = 2_000): Promise<boolean> {
  getDb();
  const pool = globalForDb.__ovenNotePool!;
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  const ping = pool
    .query("select 1")
    .then(() => true)
    .catch(() => false);
  return Promise.race([ping, timeout]);
}

export { schema };
