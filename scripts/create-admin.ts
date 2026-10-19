/**
 * Creates the admin account, or resets its password with --reset.
 *
 *   ADMIN_EMAIL=me@example.com ADMIN_PASSWORD='...' pnpm admin:create
 *
 * --reset also revokes every session and clears the login lockout.
 *
 * In production this runs as a one-off ECS task; ADMIN_PASSWORD is injected
 * from the SSM SecureString parameter Terraform creates (see docs/DEPLOY.md),
 * so the password never appears in task overrides or shell history.
 */
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { hashPassword, validateNewPassword } from "../src/lib/auth/password";
import { poolConfigFromEnv } from "../src/lib/db/config";
import { adminUsers, loginAttempts, sessions } from "../src/lib/db/schema";
import { errorFields } from "../src/lib/logger";
import { loadLocalEnv, log, requireEnv } from "./lib/env";

async function main() {
  loadLocalEnv();
  const email = requireEnv("ADMIN_EMAIL").trim().toLowerCase();
  const password = requireEnv("ADMIN_PASSWORD");
  const reset = process.argv.includes("--reset");

  const problem = validateNewPassword(password);
  if (problem) {
    console.error(problem);
    process.exit(2);
  }

  const client = new Client(poolConfigFromEnv());
  await client.connect();
  try {
    const db = drizzle(client);
    const [existing] = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(sql`lower(${adminUsers.email}) = ${email}`);

    if (existing && !reset) {
      log("admin already exists; pass --reset to change its password", { email });
      return;
    }

    const passwordHash = await hashPassword(password);
    if (existing) {
      await db.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, existing.id));
      await db.delete(sessions).where(eq(sessions.userId, existing.id));
      // Also lifts any login lockout on this account.
      await db.delete(loginAttempts).where(eq(loginAttempts.email, email));
      log("admin password reset; sessions revoked and login lockout cleared", { email });
    } else {
      await db.insert(adminUsers).values({ email, passwordHash });
      log("admin created", { email });
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // errorFields drops bound SQL parameters (e.g. the new password hash).
  console.error(JSON.stringify({ level: "error", msg: "create-admin failed", ...errorFields(err) }));
  process.exit(1);
});
