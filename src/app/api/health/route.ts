import { pingDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health        -> liveness, used by the ALB target group. It does not
 *                           touch the database: a DB blip must not make ECS
 *                           kill every healthy web task at once.
 * GET /api/health?db=1   -> readiness incl. a `select 1`, used by deploy smoke
 *                           tests and synthetic monitoring.
 */
export async function GET(request: Request) {
  const checkDb = new URL(request.url).searchParams.get("db") === "1";
  const body: Record<string, unknown> = {
    status: "ok",
    version: process.env.NEXT_DEPLOYMENT_ID || process.env.APP_VERSION || "dev",
    uptimeSec: Math.round(process.uptime()),
  };
  let status = 200;
  if (checkDb) {
    const ok = await pingDb();
    body.db = ok ? "ok" : "unreachable";
    if (!ok) {
      body.status = "degraded";
      status = 503;
    }
  }
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
