import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { audit } from "@/lib/audit";
import { serializeDates } from "@/lib/serialize";
import { json, enrichmentApiCtx, parseEntityId, readJson, parseEnrichmentBody } from "@/lib/enrichment/api";
import { dossierDigest } from "@/lib/enrichment/dossier";

type Params = { params: Promise<{ id: string }> };

const COMPANY_SELECT = {
  id: true, name: true, enrichment: true, closenessScore: true, enrichmentUpdatedAt: true,
} as const;

/** PATCH /api/companies/:id — replace the enrichment dossier. closeness_score is read-only. */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await enrichmentApiCtx(request);
  if ("res" in auth) return auth.res;
  const id = parseEntityId((await params).id);
  if (id == null) return json({ error: "Invalid id" }, 400);
  const { ctx } = auth;

  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = parseEnrichmentBody(raw);
  if (parsed instanceof Response) return parsed;
  const { enrichment } = parsed;

  const exists = await db.company.findFirst({
    where: { id, tenantId: ctx.tenantId, deletedAt: null },
    select: { enrichment: true },
  });
  if (!exists) return json({ error: "Not found" }, 404);

  try {
    await db.company.updateMany({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      data: {
        // enrichment REPLACES the stored dossier (no merge); explicit null
        // clears it. Prisma.JsonNull writes a JSONB `null` literal — that
        // still matches `WHERE enrichment IS NOT NULL`, so a cleared row must
        // use DbNull (a true SQL NULL) instead.
        enrichment: enrichment === null ? Prisma.DbNull : (enrichment as Prisma.InputJsonValue),
        enrichmentUpdatedAt: new Date(),
      },
    });
    // Digest, not the document: dossiers run ~600 KB and getEntityHistory loads
    // 100 audit rows into every detail page's RSC payload.
    audit("company", id, "update",
      { enrichment: dossierDigest(exists.enrichment) },
      { enrichment: dossierDigest(enrichment) },
      { tenantId: ctx.tenantId, actor: "agent", actorAgentId: ctx.actorAgentId });
  } catch (err) {
    reportError("api.companies.patch", err, { companyId: id, sourceApp: ctx.actorAgentId });
    return json({ error: "Internal error" }, 500);
  }

  const company = await db.company.findFirst({ where: { id, tenantId: ctx.tenantId }, select: COMPANY_SELECT });
  if (!company) return json({ error: "Not found" }, 404);
  const wire = serializeDates(company);
  return json({
    ok: true,
    company: {
      id: wire.id,
      name: wire.name,
      enrichment: wire.enrichment,
      closeness_score: wire.closenessScore,
      enrichment_updated_at: wire.enrichmentUpdatedAt,
    },
  });
}
