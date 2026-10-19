import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// The ops scripts run in two places:
//   - locally through tsx, where .env.local holds DATABASE_URL
//   - inside the production image as one-off ECS tasks, where ECS injects env
// This loader only fills variables that are not already set.
export function loadLocalEnv(files = [".env.local", ".env"]): void {
  for (const file of files) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}`);
    process.exit(2);
  }
  return value;
}

export function log(msg: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: "info", time: new Date().toISOString(), msg, ...extra }));
}
