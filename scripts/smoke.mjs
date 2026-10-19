/**
 * Post-deploy smoke test. Hits a running site over HTTP and checks status
 * codes, cache headers and security headers. It does not depend on specific
 * recipe content: recipe pages are discovered through /sitemap.xml, and an
 * empty site (first deploy, before seeding) only produces a warning unless
 * SMOKE_REQUIRE_RECIPE=1.
 *
 *   node scripts/smoke.mjs http://localhost:3000
 *   node scripts/smoke.mjs https://dxxxx.cloudfront.net   (CI runs this after deploy)
 *
 * Plain JavaScript with no dependencies, so the deploy job can run it
 * without installing node_modules. Exits non-zero if any check fails.
 */
const base = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const expectCdn = base.startsWith("https://");
const requireRecipe = process.env.SMOKE_REQUIRE_RECIPE === "1";

const failures = [];
let recipePaths = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(path, init) {
  const res = await fetch(`${base}${path}`, { redirect: "manual", ...init, signal: AbortSignal.timeout(15_000) });
  const body = await res.text();
  return { res, body };
}

const isNoStore = (res) => /no-store/.test(res.headers.get("cache-control") ?? "");

const checks = [
  {
    name: "GET /api/health?db=1 -> 200 with db ok, not cacheable",
    run: async () => {
      const { res, body } = await get(`/api/health?db=1`);
      assert(res.status === 200, `status ${res.status}: ${body}`);
      assert(JSON.parse(body).db === "ok", `db not ok: ${body}`);
      assert(isNoStore(res), "health must not be cacheable");
    },
  },
  {
    name: "GET / -> 200, CDN-cacheable",
    run: async () => {
      const { res, body } = await get("/");
      assert(res.status === 200, `status ${res.status}`);
      assert(body.includes("오븐노트"), "home page does not render the site name");
      const cc = res.headers.get("cache-control") ?? "";
      assert(/s-maxage=\d+/.test(cc) && /public/.test(cc), `home Cache-Control should be public with s-maxage, got "${cc}"`);
    },
  },
  {
    name: "GET /sitemap.xml and /robots.txt",
    run: async () => {
      const sitemap = await get("/sitemap.xml");
      assert(sitemap.res.status === 200 && sitemap.body.includes("<urlset"), "sitemap is not valid");
      recipePaths = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((m) => new URL(m[1]).pathname)
        .filter((p) => p.startsWith("/recipes/"));
      const robots = await get("/robots.txt");
      assert(robots.res.status === 200 && robots.body.includes("Disallow: /admin"), "robots.txt missing admin rule");
    },
  },
  {
    name: "a published recipe page renders with JSON-LD and security headers",
    run: async () => {
      if (recipePaths.length === 0) {
        if (requireRecipe) throw new Error("sitemap lists no recipes");
        console.log("       (warning: no published recipes yet; run the seed ops task)");
        return;
      }
      const { res, body } = await get(recipePaths[0]);
      assert(res.status === 200, `${recipePaths[0]} status ${res.status}`);
      assert(body.includes('"@type":"Recipe"'), "Recipe JSON-LD missing");
      assert(res.headers.get("content-security-policy"), "CSP header missing");
      assert(res.headers.get("x-content-type-options") === "nosniff", "nosniff header missing");
    },
  },
  {
    name: "GET /recipes/<unknown> -> 404",
    run: async () => {
      const { res } = await get(`/recipes/smoke-missing-${Date.now()}`);
      assert(res.status === 404, `expected 404, got ${res.status}`);
    },
  },
  {
    name: "redirects are never CDN-cacheable (RSC request without _rsc -> 307 no-store)",
    run: async () => {
      const { res } = await get(`/?smoke=${Date.now()}`, { headers: { rsc: "1" } });
      if (res.status >= 300 && res.status < 400) {
        assert(isNoStore(res), `redirect carried Cache-Control "${res.headers.get("cache-control")}"`);
      }
    },
  },
  {
    name: "GET /admin without session -> redirect to login",
    run: async () => {
      const { res } = await get("/admin");
      assert([302, 303, 307, 308].includes(res.status), `expected redirect, got ${res.status}`);
      assert((res.headers.get("location") ?? "").includes("/admin/login"), "redirect target is not /admin/login");
    },
  },
  {
    name: "GET /admin/login is not cacheable",
    run: async () => {
      const { res } = await get("/admin/login");
      assert(res.status === 200, `status ${res.status}`);
      assert(isNoStore(res), `admin Cache-Control should be no-store, got "${res.headers.get("cache-control")}"`);
    },
  },
  ...(expectCdn
    ? [
        {
          name: "served through CloudFront with HSTS",
          run: async () => {
            const { res } = await get("/");
            assert(res.headers.get("via")?.includes("cloudfront") || res.headers.get("x-cache"), "no CloudFront headers");
            assert(res.headers.get("strict-transport-security"), "HSTS header missing");
          },
        },
      ]
    : []),
];

async function main() {
  console.log(`Smoke testing ${base}`);
  for (const check of checks) {
    try {
      await check.run();
      console.log(`  ok   ${check.name}`);
    } catch (err) {
      failures.push(check.name);
      console.log(`  FAIL ${check.name}: ${err.message}`);
    }
  }
  if (failures.length) {
    console.error(`${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("All smoke checks passed");
}

main();
