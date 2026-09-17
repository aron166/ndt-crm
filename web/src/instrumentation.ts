import type { Instrumentation } from "next";

/**
 * Server-local time IS Budapest (Kai ruling 2026-09-17, PR #97 finding 4).
 * Vercel functions run with TZ=UTC, so every `setHours`/`getDay` in the repo
 * (the 8-17 booking workday, "today" in task views) was two hours off. Node
 * re-reads process.env.TZ on assignment, and register() runs once per server
 * instance before any request — so this fixes all of them at one place.
 * ponytail: a per-tenant timezone replaces this when a non-HU tenant exists.
 */
export const SERVER_TZ = "Europe/Budapest";

export function register() {
  process.env.TZ = SERVER_TZ;
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (resolved !== SERVER_TZ) {
    // Loud, not fatal: a wrong clock mis-schedules, a crashed server schedules nothing.
    console.error(`[instrumentation] TZ is ${resolved}, expected ${SERVER_TZ}`);
  }
}

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
