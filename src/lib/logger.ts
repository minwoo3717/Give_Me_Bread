// One JSON object per line on stdout/stderr. The awslogs driver ships each
// line to CloudWatch Logs, where Logs Insights can filter on the fields, e.g.
//   fields @timestamp, msg, err | filter level = "error" | sort @timestamp desc
type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL === "debug") write("debug", msg, fields);
  },
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};

/**
 * Loggable view of an error. Drizzle's DrizzleQueryError embeds every bound
 * parameter (password hashes, emails, IPs) in `message` and `stack`, so for
 * those only the SQL text and the Postgres error code/message are kept.
 */
export function errorFields(err: unknown): Record<string, unknown> {
  if (err && typeof err === "object" && "query" in err && "params" in err) {
    const e = err as { query: unknown; cause?: { code?: unknown; message?: unknown }; digest?: unknown };
    return {
      err: "database query failed",
      query: String(e.query),
      code: e.cause?.code,
      causeMessage: e.cause?.message,
      digest: e.digest,
    };
  }
  if (err instanceof Error) {
    return { err: err.message, stack: err.stack, name: err.name, digest: (err as { digest?: unknown }).digest };
  }
  return { err: String(err) };
}
