// Bundles the ops scripts into self-contained CommonJS files under
// dist/scripts so the production image can run them with plain `node`
// (the Next.js standalone output does not ship tsx or the full node_modules).
import { build } from "esbuild";

const entries = ["migrate", "seed", "create-admin"];

await build({
  entryPoints: entries.map((name) => `scripts/${name}.ts`),
  outdir: "dist/scripts",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  tsconfig: "tsconfig.json",
  // Optional native binding that pg never loads unless asked to.
  external: ["pg-native"],
  logLevel: "info",
});
