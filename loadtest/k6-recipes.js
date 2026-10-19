// k6 load test (https://k6.io): `k6 run -e BASE_URL=https://dxxxx.cloudfront.net loadtest/k6-recipes.js`
//
// Two scenarios:
//   cdn    - realistic traffic: same URLs over and over, so CloudFront serves
//            almost everything. Target: CAU-homepage-level peaks (300 rps).
//   origin - cache-busting query string, so every request reaches ECS + RDS.
//            Finds how many requests the tasks themselves can take and
//            whether autoscaling kicks in.
//
// IMPORTANT: AWS WAF rate-limits each IP (default 3000 page requests / 5 min).
// From a single machine, raise `waf_page_rate_limit` or set enable_waf=false
// for the test window, then restore it. Never load-test someone else's site.
import { check, sleep } from "k6";
import http from "k6/http";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const SCENARIO = __ENV.SCENARIO || "cdn";

const scenarios = {
  cdn: {
    executor: "ramping-arrival-rate",
    startRate: 10,
    timeUnit: "1s",
    preAllocatedVUs: 100,
    maxVUs: 600,
    stages: [
      { target: 100, duration: "1m" },
      { target: 300, duration: "2m" },
      { target: 300, duration: "3m" },
      { target: 0, duration: "30s" },
    ],
  },
  origin: {
    executor: "ramping-arrival-rate",
    startRate: 5,
    timeUnit: "1s",
    preAllocatedVUs: 50,
    maxVUs: 300,
    stages: [
      { target: 50, duration: "2m" },
      { target: 150, duration: "3m" },
      { target: 150, duration: "3m" },
      { target: 0, duration: "30s" },
    ],
  },
};

export const options = {
  scenarios: { [SCENARIO]: scenarios[SCENARIO] },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{page:recipe}": [SCENARIO === "cdn" ? "p(95)<300" : "p(95)<800"],
    "http_req_duration{page:home}": [SCENARIO === "cdn" ? "p(95)<300" : "p(95)<800"],
    checks: ["rate>0.99"],
  },
};

const pages = [
  { path: "/", tag: "home", weight: 0.4 },
  { path: "/recipes/financier", tag: "recipe", weight: 0.6 },
];

function pick() {
  const r = Math.random();
  let acc = 0;
  for (const p of pages) {
    acc += p.weight;
    if (r < acc) return p;
  }
  return pages[pages.length - 1];
}

export default function recipeVisitor() {
  const page = pick();
  const bust = SCENARIO === "origin" ? `?lt=${__VU}-${__ITER}` : "";
  const res = http.get(`${BASE_URL}${page.path}${bust}`, { tags: { page: page.tag } });
  check(res, {
    "status 200": (r) => r.status === 200,
    "has content": (r) => r.body && r.body.includes("휘낭시에"),
  });
  sleep(Math.random() * 0.5);
}
