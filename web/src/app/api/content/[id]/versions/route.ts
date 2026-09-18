import { NextResponse } from "next/server";
import { z } from "zod";
import { reportError } from "@/lib/report-error";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { createVersion } from "@/lib/content/service";

// POST /api/content/:id/versions — the content-revise skill posts a rewrite.
// App-key auth. `change_note` is required (the service also enforces this for
// app actors); `based_on_version_id` must be the item's CURRENT version or the
// service returns 409 (race rule, spec §1).

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

const versionSchema = z.object({
  body: z.string().trim().min(1).max(50000),
  change_note: z.string().trim().min(1).max(4000),
  based_on_version_id: z.number().int().positive(),
  needs_human_asset: z.boolean().optional(),
  /** The agent's own judgement of this rewrite (display only for now). */
  self_score: z.number().min(0).max(1).optional(),
  self_note: z.string().trim().max(500).optional(),
  /** The source file changed: restate it as a new version (importer --refresh). */
  from_source: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const key = await validateAppKey(request);
  if (!key) return json({ error: "Unauthorized" }, 401);
  if (!rateLimit(key.keyId)) return json({ error: "Rate limit exceeded (30 req/min)" }, 429);

  const idStr = (await params).id;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Invalid id" }, 400);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const parsed = versionSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;

  try {
    const result = await createVersion(
      { tenantId: key.tenantId, kind: "app", appSlug: key.appSlug },
      id,
      {
        body: input.body,
        changeNote: input.change_note,
        basedOnVersionId: input.based_on_version_id,
        needsHumanAsset: input.needs_human_asset,
        selfScore: input.self_score ?? null,
        selfNote: input.self_note ?? null,
        fromSource: input.from_source ?? false,
      },
    );
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ ok: true, versionId: result.versionId, number: result.number }, 201);
  } catch (err) {
    reportError("api.content.versions", err, { tenantId: key.tenantId, itemId: id });
    return json({ error: "Internal error" }, 500);
  }
}
