import type { Instrumentation } from "next";
import { errorFields } from "./lib/logger";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log(
      JSON.stringify({
        level: "info",
        time: new Date().toISOString(),
        msg: "server starting",
        version: process.env.NEXT_DEPLOYMENT_ID ?? "dev",
        node: process.version,
      }),
    );
  }
}

// Every server-side render/action/route error becomes one structured log line,
// which the CloudWatch metric filter "AppErrors" counts (infra/terraform).
// errorFields() strips bound SQL parameters so secrets never reach the logs.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  console.error(
    JSON.stringify({
      level: "error",
      time: new Date().toISOString(),
      msg: "request error",
      ...errorFields(err),
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
    }),
  );
};
