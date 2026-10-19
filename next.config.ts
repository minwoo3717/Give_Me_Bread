import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Public HTML is rendered per request from Postgres and cached at the
// CloudFront edge for 5 minutes (s-maxage). Browsers always revalidate
// (max-age=0). Saving a recipe in the admin invalidates CloudFront, so edits
// show up within seconds instead of waiting out the TTL.
const PUBLIC_PAGE_CACHE = "public, max-age=0, s-maxage=300, stale-while-revalidate=60";
const NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate";

// No nonces: public pages are shared through the CDN cache, so a per-request
// nonce cannot be used. Next.js inlines its bootstrap scripts, which requires
// 'unsafe-inline' for scripts; everything else is locked to this origin.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // Self-contained server (server.js + traced node_modules) for the Docker image.
  output: "standalone",
  poweredByHeader: false,
  // No next/image in this app; turning the optimizer off removes the
  // /_next/image endpoint (and its sharp attack surface) entirely.
  images: { unoptimized: true },
  // Version-skew handling during rolling ECS deploys: NEXT_DEPLOYMENT_ID (the
  // git SHA) is set at build time, assets get ?dpl=<id> and stale clients do a
  // hard reload on navigation. Server Action IDs stay stable across builds
  // only with a fixed NEXT_SERVER_ACTIONS_ENCRYPTION_KEY (see Dockerfile).
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || undefined,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/", headers: [{ key: "Cache-Control", value: PUBLIC_PAGE_CACHE }] },
      { source: "/recipes/:path*", headers: [{ key: "Cache-Control", value: PUBLIC_PAGE_CACHE }] },
      { source: "/sitemap.xml", headers: [{ key: "Cache-Control", value: PUBLIC_PAGE_CACHE }] },
      { source: "/robots.txt", headers: [{ key: "Cache-Control", value: PUBLIC_PAGE_CACHE }] },
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: NO_STORE }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: NO_STORE }] },
    ];
  },
};

export default nextConfig;
