import { NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { getQueue } from "@/lib/content/service";
import { CONTENT_CATEGORIES, CONTENT_STATUSES, isContentStatus, type ContentStatus } from "@/lib/content/types";

// GET /api/content/queue — items the content-revise skill should pick up.
// App-key auth, same shape as the rest of the content API.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const DEFAULT_STATUSES: ContentStatus[] = ["changes_requested", "rewrite_requested"];

export async function GET(request: Request) {
  const key = await validateAppKey(request);
  if (!key) return json({ error: "Unauthorized" }, 401);
  if (!rateLimit(key.keyId)) return json({ error: "Rate limit exceeded (30 req/min)" }, 429);

  const raw = new URL(request.url).searchParams.get("status");
  let statuses: ContentStatus[] = DEFAULT_STATUSES;
  if (raw) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0 || !parts.every(isContentStatus)) {
      return json(
        { error: "Invalid status", details: { allowed: CONTENT_STATUSES } },
        400,
      );
    }
    statuses = parts as ContentStatus[];
  }

  // Optional category filter: an agent that posted a `decision` question
  // reads back whether it was answered without a human relaying it (the
  // per-item `checks` payload already carries `state` and `answer`).
  const rawCategory = new URL(request.url).searchParams.get("category");
  let category: string | undefined;
  if (rawCategory) {
    if (!(CONTENT_CATEGORIES as readonly string[]).includes(rawCategory)) {
      return json({ error: "Invalid category", details: { allowed: CONTENT_CATEGORIES } }, 400);
    }
    category = rawCategory;
  }

  try {
    const items = await getQueue(key.tenantId, statuses, { category });
    return json({ ok: true, items }, 200);
  } catch (err) {
    reportError("api.content.queue", err, { tenantId: key.tenantId });
    return json({ error: "Internal error" }, 500);
  }
}
