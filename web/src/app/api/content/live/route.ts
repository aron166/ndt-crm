import { NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { jsonApi, requireAppKey } from "@/lib/api/http";
import { getLive } from "@/lib/content/service";

// GET /api/content/live — live (dual-approved) versions for consumers
// (outreach queue, setter script panel, landing/lead-magnet links). App-key
// auth. Never falls back to a non-live version (spec §6).

const api = jsonApi("GET, OPTIONS");
const json = api.json;
export const OPTIONS = api.OPTIONS;

export async function GET(request: Request) {
  const key = await requireAppKey(request, json);
  if (key instanceof NextResponse) return key;

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
