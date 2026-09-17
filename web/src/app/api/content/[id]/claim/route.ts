import { NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { claimItem } from "@/lib/content/service";

// POST /api/content/:id/claim — the content-revise skill claims an item
// before rewriting it. Idempotent for the same app while the claim is fresh;
// 409 if claimed by someone else / not in a requestable state.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const key = await validateAppKey(request);
  if (!key) return json({ error: "Unauthorized" }, 401);
  if (!rateLimit(key.keyId)) return json({ error: "Rate limit exceeded (30 req/min)" }, 429);

  const idStr = (await params).id;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Invalid id" }, 400);

  try {
    const result = await claimItem({ tenantId: key.tenantId, kind: "app", appSlug: key.appSlug }, id);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ ok: true, alreadyClaimed: result.alreadyClaimed }, 200);
  } catch (err) {
    reportError("api.content.claim", err, { tenantId: key.tenantId, itemId: id });
    return json({ error: "Internal error" }, 500);
  }
}
