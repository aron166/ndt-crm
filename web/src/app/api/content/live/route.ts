import { NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { getLive } from "@/lib/content/service";

// GET /api/content/live — live (dual-approved) versions for consumers
// (outreach queue, setter script panel, landing/lead-magnet links). App-key
// auth. Never falls back to a non-live version (spec §6).

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

export async function GET(request: Request) {
  const key = await validateAppKey(request);
  if (!key) return json({ error: "Unauthorized" }, 401);
  if (!rateLimit(key.keyId)) return json({ error: "Rate limit exceeded (30 req/min)" }, 429);

  const params = new URL(request.url).searchParams;
  const category = params.get("category")?.trim() || undefined;
  const campaignSlug = params.get("campaign")?.trim() || undefined;
  const format = params.get("format")?.trim() || undefined;

  try {
    const items = await getLive(key.tenantId, { category, campaignSlug, format });
    return json({ ok: true, items }, 200);
  } catch (err) {
    reportError("api.content.live", err, { tenantId: key.tenantId });
    return json({ error: "Internal error" }, 500);
  }
}
