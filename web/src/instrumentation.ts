import type { Instrumentation } from "next";

// Server-side observability hook (Next.js instrumentation file convention).
// Catches every UNHANDLED server error — RSC renders, route handlers, server
// actions, proxy — and funnels it through the central reporter. Handled
// failures (fail-safe automations, audit writes, ingest catches) call
// reportError at their own catch sites.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { reportError } = await import("@/lib/report-error");
  reportError(`unhandled:${context.routeType}`, err, {
    // Query strings can carry PII (search terms, emails) — report the path only.
    path: request.path.split("?")[0],
    method: request.method,
    routePath: context.routePath,
  });
};
