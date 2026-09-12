import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { audit } from "@/lib/audit";
import { serializeDates } from "@/lib/serialize";
import { json, enrichmentApiCtx, parseEntityId, readJson, parseEnrichmentBody } from "@/lib/enrichment/api";

type Params = { params: Promise<{ id: string }> };

const PERSON_SELECT = {
  id: true, firstName: true, lastName: true, enrichment: true, closenessScore: true, enrichmentUpdatedAt: true,
} as const;

/** PATCH /api/persons/:id — replace the enrichment dossier. closeness_score is read-only. */
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

  const exists = await db.person.findFirst({
    where: { id, tenantId: ctx.tenantId, deletedAt: null },
    select: { enrichment: true },
  });
  if (!exists) return json({ error: "Not found" }, 404);

  try {
    await db.person.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: {
        // enrichment REPLACES the stored dossier (no merge); explicit null clears it.
        enrichment: enrichment === null ? Prisma.JsonNull : (enrichment as Prisma.InputJsonValue),
        enrichmentUpdatedAt: new Date(),
      },
    });
    audit("person", id, "update", { enrichment: exists.enrichment as Record<string, unknown> | null }, { enrichment },
      { tenantId: ctx.tenantId, actor: "agent", actorAgentId: ctx.actorAgentId });
  } catch (err) {
    reportError("api.persons.patch", err, { personId: id, sourceApp: ctx.actorAgentId });
    return json({ error: "Internal error" }, 500);
  }

  const person = await db.person.findFirst({ where: { id, tenantId: ctx.tenantId }, select: PERSON_SELECT });
  const wire = serializeDates(person!);
  return json({
    ok: true,
    person: {
      id: wire.id,
      first_name: wire.firstName,
      last_name: wire.lastName,
      enrichment: wire.enrichment,
      closeness_score: wire.closenessScore,
      enrichment_updated_at: wire.enrichmentUpdatedAt,
    },
  });
}
