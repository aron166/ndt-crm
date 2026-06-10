// Central server-error reporter (the observability chokehold).
//
// Every "must be observable" failure funnels through here: the structured
// console.error always happens (visible in Vercel logs), and when
// ERROR_WEBHOOK_URL is set the error is also pushed to that webhook so failures
// alert instead of scrolling away. The body carries both `text` (Slack) and
// `content` (Discord) so either webhook renders it without a relay; a custom
// receiver (or a future Sentry tunnel) can read the structured `error` field.
//
// Reporting must never throw or block the operation that failed — fire-and-
// forget with a hard timeout.

const WEBHOOK_TIMEOUT_MS = 3000;

export interface ReportContext {
  [key: string]: unknown;
}

/**
 * Report a server-side failure: structured console.error always, webhook alert
 * when ERROR_WEBHOOK_URL is set. Never throws, never blocks the caller.
 *
 * ⚠️ `context` is logged AND sent to the external webhook unsanitized — pass
 * only identifiers (ids, scopes, route paths without query strings), never
 * PII, tokens, or payload contents.
 */
export function reportError(scope: string, err: unknown, context: ReportContext = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  console.error(`[${scope}]`, message, { ...context, stack });

  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;

  const summary = `🔴 [helm-crm] ${scope}: ${message}`;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: summary,
      content: summary,
      error: { scope, message, stack, context, at: new Date().toISOString() },
    }),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  }).catch((webhookErr) => {
    console.error("[report-error] webhook delivery failed:", webhookErr);
  });
}
