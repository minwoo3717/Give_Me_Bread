import "server-only";

import { and, count, eq, gt, lt, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { loginAttempts } from "../db/schema";

// Failed logins inside the window that lock further attempts. Kept in
// Postgres so the limits hold across every ECS task.
//   per (email, network): stops password guessing from one client
//   per network         : stops one client from spraying many emails
//   per email           : stops guessing spread over many networks; high on
//                         purpose so a single attacker cannot lock the real
//                         admin out (ops can also clear it, see create-admin)
// "network" is the IPv4 address or the IPv6 /64 (see rateLimitKey).
export const LOGIN_WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_PAIR = 5;
export const MAX_FAILURES_PER_IP = 20;
export const MAX_FAILURES_PER_EMAIL = 50;

export type LoginGate = { allowed: true; attemptId: number } | { allowed: false };

/**
 * Reserve-then-count: the attempt is recorded as a failure *before* the
 * password is checked, so a burst of concurrent requests cannot all read a
 * count below the limit. Under READ COMMITTED the k-th count to run sees at
 * least k reservations, so at most MAX_FAILURES_PER_PAIR requests get through.
 */
export async function reserveLoginAttempt(ip: string, email: string): Promise<LoginGate> {
  const db = getDb();
  const [row] = await db
    .insert(loginAttempts)
    .values({ ip, email: email.slice(0, 254), success: false })
    .returning({ id: loginAttempts.id });

  const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60_000);
  const failed = (scope: SQL | undefined) =>
    db
      .select({ n: count() })
      .from(loginAttempts)
      .where(and(scope, eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));

  const [[pair], [byIp], [byEmail]] = await Promise.all([
    failed(and(eq(loginAttempts.email, email), eq(loginAttempts.ip, ip))),
    failed(eq(loginAttempts.ip, ip)),
    failed(eq(loginAttempts.email, email)),
  ]);

  if (pair.n > MAX_FAILURES_PER_PAIR || byIp.n > MAX_FAILURES_PER_IP || byEmail.n > MAX_FAILURES_PER_EMAIL) {
    // Blocked requests do not count, otherwise every blocked retry would
    // extend the lockout.
    await releaseLoginAttempt(row.id);
    return { allowed: false };
  }
  return { allowed: true, attemptId: row.id };
}

/** Drops a reservation that never reached the password check. */
export async function releaseLoginAttempt(attemptId: number): Promise<void> {
  await getDb().delete(loginAttempts).where(eq(loginAttempts.id, attemptId));
}

/** Failures are already recorded by the reservation; a success clears the streak. */
export async function completeLoginAttempt(attemptId: number, email: string, success: boolean): Promise<void> {
  const db = getDb();
  if (success) {
    await db.update(loginAttempts).set({ success: true }).where(eq(loginAttempts.id, attemptId));
    await db.delete(loginAttempts).where(and(eq(loginAttempts.email, email), eq(loginAttempts.success, false)));
  }
  // Keep a day of history for auditing; drop the rest.
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60_000)));
}
