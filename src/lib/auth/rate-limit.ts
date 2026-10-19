import "server-only";

import { and, count, eq, gt, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { loginAttempts } from "../db/schema";

// Failed logins inside the window that lock further attempts. Kept in
// Postgres so the limits hold across every ECS task.
//   per (email, network): stops password guessing from one client
//   per network         : stops one client from spraying many emails
//   per email           : stops guessing spread over many networks
// "network" is the IPv4 address or the IPv6 /64 (see rateLimitKey).
//
// A network that logged in successfully within TRUSTED_NETWORK_DAYS is exempt
// from the per-email limit: otherwise an attacker with ~10 addresses could
// keep the real admin locked out of every network indefinitely.
export const LOGIN_WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_PAIR = 5;
export const MAX_FAILURES_PER_IP = 20;
export const MAX_FAILURES_PER_EMAIL = 50;
export const TRUSTED_NETWORK_DAYS = 30;

export type LoginGate = { allowed: true; attemptId: number } | { allowed: false };

/**
 * Admits or refuses one login attempt and, if admitted, records it as a
 * failure until completeLoginAttempt says otherwise.
 *
 * Attempts for the same email and the same network are serialized with
 * transaction-scoped advisory locks, so the counts are exact even for a burst
 * of concurrent requests: the first MAX_FAILURES_PER_PAIR get through, the
 * rest are refused without being recorded. Locks are always taken email
 * first, then network, so two transactions can never wait on each other.
 */
export async function reserveLoginAttempt(ip: string, email: string): Promise<LoginGate> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`login-email:${email}`}, 0))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`login-ip:${ip}`}, 0))`);

    const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60_000);
    const trustedSince = new Date(Date.now() - TRUSTED_NETWORK_DAYS * 24 * 60 * 60_000);
    const failures = async (scope: SQL | undefined) => {
      const [row] = await tx
        .select({ n: count() })
        .from(loginAttempts)
        .where(and(scope, eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));
      return row.n;
    };

    const pair = await failures(and(eq(loginAttempts.email, email), eq(loginAttempts.ip, ip)));
    const byIp = await failures(eq(loginAttempts.ip, ip));
    const byEmail = await failures(eq(loginAttempts.email, email));
    const [trusted] = await tx
      .select({ n: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.email, email),
          eq(loginAttempts.ip, ip),
          eq(loginAttempts.success, true),
          gt(loginAttempts.createdAt, trustedSince),
        ),
      );

    const emailCapped = trusted.n === 0 && byEmail >= MAX_FAILURES_PER_EMAIL;
    if (pair >= MAX_FAILURES_PER_PAIR || byIp >= MAX_FAILURES_PER_IP || emailCapped) {
      return { allowed: false } as const;
    }

    const [row] = await tx
      .insert(loginAttempts)
      .values({ ip, email: email.slice(0, 254), success: false })
      .returning({ id: loginAttempts.id });
    return { allowed: true, attemptId: row.id } as const;
  });
}

/** Drops a reservation that never reached the password check. */
export async function releaseLoginAttempt(attemptId: number): Promise<void> {
  await getDb().delete(loginAttempts).where(eq(loginAttempts.id, attemptId));
}

/**
 * Failures are already recorded by the reservation. A success is kept (it
 * marks the network as trusted for this email) and clears the failure streak.
 */
export async function completeLoginAttempt(attemptId: number, email: string, success: boolean): Promise<void> {
  const db = getDb();
  if (success) {
    await db.update(loginAttempts).set({ success: true }).where(eq(loginAttempts.id, attemptId));
    await db.delete(loginAttempts).where(and(eq(loginAttempts.email, email), eq(loginAttempts.success, false)));
  }
  // Failures are only needed for a day (auditing), successes for the trust
  // window. Indexed on created_at, so this stays cheap under attack.
  await db
    .delete(loginAttempts)
    .where(
      or(
        and(
          eq(loginAttempts.success, false),
          lt(loginAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60_000)),
        ),
        lt(loginAttempts.createdAt, new Date(Date.now() - TRUSTED_NETWORK_DAYS * 24 * 60 * 60_000)),
      ),
    );
}
