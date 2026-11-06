import { NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { jsonApi, requireAppKey } from "@/lib/api/http";
import { claimItem } from "@/lib/content/service";

// POST /api/content/:id/claim — the content-revise skill claims an item
// before rewriting it. Idempotent for the same app while the claim is fresh;
// 409 if claimed by someone else / not in a requestable state.

const api = jsonApi("POST, OPTIONS");
const json = api.json;
export const OPTIONS = api.OPTIONS;

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const key = await requireAppKey(request, json);
  if (key instanceof NextResponse) return key;

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
