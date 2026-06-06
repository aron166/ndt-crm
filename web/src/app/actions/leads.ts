"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { isLeadStatus, leadStatusLabel } from "@/lib/leads/statuses";

const TENANT_ID = 1;

export async function moveLead(leadId: number, newStatus: string) {
  if (!isLeadStatus(newStatus)) return { error: "Ismeretlen státusz" };

  const before = await db.lead.findFirst({
    where: { id: leadId, tenantId: TENANT_ID },
    select: { status: true },
  });
  if (!before) return { error: "Lead nem található" };

  await db.lead.updateMany({
    where: { id: leadId, tenantId: TENANT_ID },
    data: { status: newStatus },
  });

  audit("lead", leadId, "update",
    { status: before.status, statusLabel: leadStatusLabel(before.status) },
    { status: newStatus, statusLabel: leadStatusLabel(newStatus) },
  );
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}

export async function updateLeadStatus(leadId: number, newStatus: string) {
  return moveLead(leadId, newStatus);
}

/**
 * Convert a lead into a Deal in the default (first, non-archived) pipeline,
 * linked to the same company + person. Marks the lead "qualified" and audits.
 */
export async function convertLeadToDeal(leadId: number) {
  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId: TENANT_ID },
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { personId: true } },
    },
  });
  if (!lead) return { error: "Lead nem található" };
  if (!lead.companyId || !lead.company) return { error: "A leadhez nincs cég társítva" };

  const pipeline = await db.pipeline.findFirst({
    where: { tenantId: TENANT_ID, isArchived: false },
    orderBy: { position: "asc" },
    include: { stages: { orderBy: { position: "asc" }, take: 1 } },
  });
  if (!pipeline) return { error: "Nincs pipeline — hozz létre egyet előbb" };

  const firstStage = pipeline.stages[0] ?? null;

  const maxPos = await db.deal.aggregate({
    where: { tenantId: TENANT_ID, stageId: firstStage?.id ?? null },
    _max: { position: true },
  });

  const deal = await db.deal.create({
    data: {
      tenantId: TENANT_ID,
      title: lead.serviceInterest?.trim() || `${lead.company.name} — érdeklődés`,
      companyId: lead.companyId,
      personId: lead.contact?.personId ?? null,
      pipelineId: pipeline.id,
      stageId: firstStage?.id ?? null,
      value: lead.estimatedValue ?? null,
      currency: "HUF",
      position: (maxPos._max.position ?? -1) + 1,
    },
    select: { id: true },
  });

  // The lead's job is done once it becomes a deal — mark it qualified.
  await db.lead.updateMany({
    where: { id: leadId, tenantId: TENANT_ID },
    data: { status: "qualified" },
  });

  audit("deal", deal.id, "create", null, {
    title: lead.serviceInterest ?? lead.company.name,
    fromLeadId: leadId,
  });
  audit("lead", leadId, "update",
    { status: lead.status },
    { status: "qualified", convertedToDealId: deal.id },
  );

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/deals");
  return { success: true, dealId: deal.id };
}
