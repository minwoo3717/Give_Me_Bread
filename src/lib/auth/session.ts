import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db";
import { adminUsers, sessions } from "../db/schema";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `__Host-` cookies must be Secure, Path=/ and host-only, so browsers refuse
 * them over plain http. Production (CloudFront, HTTPS) uses the prefix; local
 * `next dev` over http://localhost does not. SESSION_COOKIE_SECURE=false lets
 * a production build run over http on a laptop.
 */
function cookieSettings() {
  const secure = process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_SECURE !== "false";
  return { name: secure ? "__Host-oven_session" : "oven_session", secure };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number, meta: { ip: string; userAgent: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const db = getDb();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  // Opportunistic cleanup keeps the table small without a cron job.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

  const { name, secure } = cookieSettings();
  (await cookies()).set(name, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export type CurrentAdmin = { id: number; email: string; sessionId: string };

/** Resolves the signed-in admin for this request (memoized per request). */
export const getCurrentAdmin = cache(async (): Promise<CurrentAdmin | null> => {
  const { name } = cookieSettings();
  const token = (await cookies()).get(name)?.value;
  if (!token) return null;
  const id = hashToken(token);
  const [row] = await getDb()
    .select({ id: adminUsers.id, email: adminUsers.email, sessionId: sessions.id })
    .from(sessions)
    .innerJoin(adminUsers, eq(adminUsers.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
});

/**
 * The real authorization check. proxy.ts only redirects visitors without a
 * cookie; every admin page and Server Action must call this.
 */
export async function requireAdmin(): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function destroyCurrentSession() {
  const { name, secure } = cookieSettings();
  const store = await cookies();
  const token = store.get(name)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.id, hashToken(token)));
  // Browsers ignore a __Host- cookie update (including a deletion) that is
  // not Secure with Path=/, so delete with the same attributes it was set with.
  store.delete({ name, path: "/", secure, httpOnly: true, sameSite: "lax" });
}

export async function destroyOtherSessions(userId: number, keepSessionId: string) {
  await getDb()
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
}
