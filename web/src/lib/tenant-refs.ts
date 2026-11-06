import { db } from "@/lib/db";

// Ids taken from user input must belong to the acting tenant before they are
// written onto a row: a foreign id is a probe or a stale form, never a link.

export interface TenantRefs {
  companyId?: number | null;
  personId?: number | null;
  dealId?: number | null;
  taskId?: number | null;
  pipelineId?: number | null;
  stageId?: number | null;
}

/** The first foreign or unknown id as a user-facing message, or null when all are ours. */
export async function foreignIdError(tenantId: number, ids: TenantRefs): Promise<string | null> {
  const { companyId, personId, dealId, taskId, pipelineId, stageId } = ids;
  const own = { tenantId };
  const sel = { id: true } as const;
  if (companyId != null && !(await db.company.findFirst({ where: { id: companyId, ...own }, select: sel }))) return "Cég nem található";
  if (personId != null && !(await db.person.findFirst({ where: { id: personId, ...own }, select: sel }))) return "Személy nem található";
  if (dealId != null && !(await db.deal.findFirst({ where: { id: dealId, ...own }, select: sel }))) return "Üzlet nem található";
  if (taskId != null && !(await db.task.findFirst({ where: { id: taskId, ...own }, select: sel }))) return "Feladat nem található";
  if (pipelineId != null && !(await db.pipeline.findFirst({ where: { id: pipelineId, ...own }, select: sel }))) return "Pipeline nem található";
  if (stageId != null && !(await db.pipelineStage.findFirst({ where: { id: stageId, pipeline: own }, select: sel }))) return "Szakasz nem található";
  return null;
}
