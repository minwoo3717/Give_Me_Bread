/**
 * Local PostgreSQL 18 without Docker.
 *
 *   pnpm db:dev      # leave it running in its own terminal, Ctrl+C to stop
 *
 * Connection: postgres://postgres:postgres@localhost:5433/bakery
 *
 * The Postgres binaries ship in the embedded-postgres npm package. They are
 * copied once to an ASCII-only folder outside the project and run from
 * there, because on Windows initdb fails when its own install path or the
 * data directory contains non-ASCII characters (this repo lives under
 * "OneDrive\바탕 화면"). Keeping the data directory out of OneDrive also
 * stops OneDrive from syncing live database files.
 *
 * Overrides: DEV_DB_PORT (default 5433), DEV_DB_HOME (default
 * %LOCALAPPDATA%\oven-note or ~/.local/share/oven-note).
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Client } from "pg";

const PORT = Number(process.env.DEV_DB_PORT ?? 5433);
const USER = "postgres";
const PASSWORD = "postgres";
const DATABASE = "bakery";

const PLATFORM_PACKAGES: Record<string, string> = {
  "win32-x64": "@embedded-postgres/windows-x64",
  "darwin-arm64": "@embedded-postgres/darwin-arm64",
  "darwin-x64": "@embedded-postgres/darwin-x64",
  "linux-x64": "@embedded-postgres/linux-x64",
  "linux-arm64": "@embedded-postgres/linux-arm64",
};

function homeDir(): string {
  if (process.env.DEV_DB_HOME) return process.env.DEV_DB_HOME;
  const base =
    process.platform === "win32"
      ? (process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"))
      : join(homedir(), ".local", "share");
  return join(base, "oven-note");
}

function packagedNativeDir(): { dir: string; version: string } {
  const pkg = PLATFORM_PACKAGES[`${process.platform}-${process.arch}`];
  if (!pkg) throw new Error(`No embedded Postgres binaries for ${process.platform}-${process.arch}`);
  // pnpm keeps the platform package private to embedded-postgres, so resolve
  // it from there.
  const embedded = createRequire(resolve("package.json")).resolve("embedded-postgres");
  const pkgRoot = resolve(dirname(createRequire(embedded).resolve(pkg)), "..");
  const { version } = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as { version: string };
  return { dir: join(pkgRoot, "native"), version };
}

function exe(binDir: string, name: string): string {
  return join(binDir, process.platform === "win32" ? `${name}.exe` : name);
}

function installBinaries(home: string): string {
  const { dir, version } = packagedNativeDir();
  const target = join(home, `pg-${version}`);
  if (!existsSync(join(target, "bin"))) {
    console.log(`Copying Postgres binaries to ${target} (one time, ~110 MB)...`);
    mkdirSync(home, { recursive: true });
    cpSync(dir, target, { recursive: true });
  }
  return join(target, "bin");
}

function initCluster(binDir: string, dataDir: string) {
  const pwFile = join(tmpdir(), `oven-note-pw-${process.pid}`);
  writeFileSync(pwFile, PASSWORD);
  try {
    const result = spawnSync(
      exe(binDir, "initdb"),
      ["-D", dataDir, "-U", USER, `--pwfile=${pwFile}`, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C"],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      rmSync(dataDir, { recursive: true, force: true });
      throw new Error(`initdb failed with exit code ${result.status}`);
    }
  } finally {
    rmSync(pwFile, { force: true });
  }
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const client = new Client({ host: "localhost", port: PORT, user: USER, password: PASSWORD, database: "postgres" });
    try {
      await client.connect();
      await client.end();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("Postgres did not accept connections within 30s");
}

async function ensureDatabase() {
  const client = new Client({ host: "localhost", port: PORT, user: USER, password: PASSWORD, database: "postgres" });
  await client.connect();
  try {
    const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [DATABASE]);
    if (rowCount === 0) {
      await client.query(`create database ${DATABASE}`);
      console.log(`Created database "${DATABASE}".`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  const home = homeDir();
  if (/[^\x20-\x7e]/.test(home)) {
    console.error(`DEV_DB_HOME must be an ASCII-only path (got ${home}).`);
    process.exit(2);
  }
  const binDir = installBinaries(home);
  const dataDir = join(home, "pgdata");
  if (!existsSync(join(dataDir, "PG_VERSION"))) initCluster(binDir, dataDir);

  const server = spawn(exe(binDir, "postgres"), ["-D", dataDir, "-p", String(PORT), "-c", "listen_addresses=localhost"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  server.on("exit", (code) => {
    console.log(`postgres exited (${code ?? "signal"})`);
    process.exit(code ?? 0);
  });

  await waitForServer();
  await ensureDatabase();
  console.log(`PostgreSQL is running: postgres://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`);
  console.log(`Data directory: ${dataDir}`);
  console.log("Press Ctrl+C to stop.");

  const stop = () => {
    // pg_ctl performs a clean "fast" shutdown on every platform.
    spawnSync(exe(binDir, "pg_ctl"), ["stop", "-D", dataDir, "-m", "fast"], { stdio: "inherit" });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
