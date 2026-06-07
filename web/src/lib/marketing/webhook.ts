// Approval webhook dispatch. On a content item reaching `approved`, if
// CONTENT_WEBHOOK_URL is set we POST the full item + assets to it (n8n consumes
// downstream). Fire-and-forget with ONE retry. A webhook failure must NEVER
// block or fail the approval — it is logged (console + audit by the caller) and
// swallowed.

export interface WebhookContentPayload {
  event: "content.approved";
  item: {
    id: number;
    tenantId: number;
    campaignId: number | null;
    channel: string;
    contentType: string;
    title: string;
    body: string;
    status: string;
    internal: boolean;
    scheduledFor: string | null;
    source: string;
    sourceMeta: unknown;
    externalUrl: string | null;
  };
  assets: { kind: string; url: string; caption: string | null; position: number }[];
}

export interface WebhookResult {
  attempted: boolean; // false when CONTENT_WEBHOOK_URL is unset
  ok: boolean;
  status?: number;
  error?: string;
}

const TIMEOUT_MS = 8000;

async function postOnce(url: string, payload: WebhookContentPayload): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dispatch the approval webhook. Returns a result instead of throwing — the
 * caller logs it but never lets it affect the approval outcome. Reads
 * CONTENT_WEBHOOK_URL lazily so tests can set/unset it per case.
 */
export async function dispatchApprovalWebhook(
  payload: WebhookContentPayload,
): Promise<WebhookResult> {
  const url = process.env.CONTENT_WEBHOOK_URL;
  if (!url) return { attempted: false, ok: false };

  let lastErr = "";
  // Two attempts total (initial + one retry).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await postOnce(url, payload);
      if (res.ok) return { attempted: true, ok: true, status: res.status };
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  return { attempted: true, ok: false, error: lastErr };
}
