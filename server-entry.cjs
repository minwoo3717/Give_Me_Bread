/* eslint-disable @typescript-eslint/no-require-imports */
// Production entry point (Dockerfile CMD): wraps the Next.js standalone
// server.js.
//
// next.config.ts gives public pages "Cache-Control: public, s-maxage=300", and
// Next keeps a user-set Cache-Control even when the render fails. Without
// this guard, a 500 (e.g. during an RDS failover) or one of Next's RSC 307
// redirects would be cached by CloudFront for 5 minutes. Here every 5xx and
// 3xx response is forced to no-store; 2xx and 404 keep the CDN caching.
"use strict";

const http = require("node:http");

const NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate";
const originalWriteHead = http.ServerResponse.prototype.writeHead;

function stripCacheControl(headers) {
  if (Array.isArray(headers)) {
    // Either [[name, value], ...] or a flat [name, value, name, value, ...] list.
    if (headers.length > 0 && Array.isArray(headers[0])) {
      return headers.filter(([name]) => String(name).toLowerCase() !== "cache-control");
    }
    const out = [];
    for (let i = 0; i < headers.length; i += 2) {
      if (String(headers[i]).toLowerCase() !== "cache-control") out.push(headers[i], headers[i + 1]);
    }
    return out;
  }
  if (headers && typeof headers === "object") {
    const out = { ...headers };
    for (const key of Object.keys(out)) {
      if (key.toLowerCase() === "cache-control") delete out[key];
    }
    return out;
  }
  return headers;
}

http.ServerResponse.prototype.writeHead = function writeHead(statusCode, ...rest) {
  const code = typeof statusCode === "number" ? statusCode : this.statusCode;
  if (code >= 300 && code !== 304 && !(code >= 400 && code < 500)) {
    const args = rest.map((arg) => (typeof arg === "string" ? arg : stripCacheControl(arg)));
    if (!this.headersSent) this.setHeader("Cache-Control", NO_STORE);
    return originalWriteHead.call(this, statusCode, ...args);
  }
  return originalWriteHead.call(this, statusCode, ...rest);
};

// The Next.js server reads HOSTNAME to choose the bind address. ECS/Fargate
// may set HOSTNAME to the task's own DNS name, which would make Next listen on
// the ENI address only and break the 127.0.0.1 container health check.
process.env.HOSTNAME = process.env.BIND_HOST || "0.0.0.0";

require("./server.js");
