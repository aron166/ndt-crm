"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Field RUM (INP / LCP / CLS + element attribution). Nothing was instrumented
 * before 2026-09-07 — the package was not installed, so the app never reported a
 * single field metric.
 *
 * This wrapper exists only because `beforeSend` is a function: the root layout is
 * a Server Component and cannot pass one to a client component (`Functions cannot
 * be passed directly to Client Components`).
 *
 * `beforeSend` drops the query string. `/persons?search=…` and the `/companies`
 * filter params carry customer names, and this is a login-gated CRM — the pathname
 * is all the RUM needs. (Vanda, PR #83.)
 */
export function Insights() {
  return <SpeedInsights beforeSend={(d) => ({ ...d, url: d.url.split("?")[0] })} />;
}
