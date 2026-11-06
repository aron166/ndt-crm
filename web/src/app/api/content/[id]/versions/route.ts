import { NextResponse } from "next/server";
import { z } from "zod";
import { reportError } from "@/lib/report-error";
import { jsonApi, readJson, requireAppKey } from "@/lib/api/http";
import { createVersion } from "@/lib/content/service";

// POST /api/content/:id/versions — the content-revise skill posts a rewrite.
// App-key auth. `change_note` is required (the service also enforces this for
// app actors); `based_on_version_id` must be the item's CURRENT version or the
// service returns 409 (race rule, spec §1).

const api = jsonApi("POST, OPTIONS");
const json = api.json;
export const OPTIONS = api.OPTIONS;

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
  /** Correct a wrongly-set internal flag on the item (see docs/api.md). */
  internal: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const key = await requireAppKey(request, json);
  if (key instanceof NextResponse) return key;

  const idStr = (await params).id;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Invalid id" }, 400);

  const raw = await readJson(request, json);
  if (raw instanceof NextResponse) return raw;
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
        internal: input.internal,
      },
    );
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ ok: true, versionId: result.versionId, number: result.number }, 201);
  } catch (err) {
    reportError("api.content.versions", err, { tenantId: key.tenantId, itemId: id });
    return json({ error: "Internal error" }, 500);
  }
}
