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

  const firstStage = pipeline.stages[0];
  if (!firstStage) {
    return { error: "A pipeline-nak nincs egyetlen szakasza sem — előbb hozz létre egyet" };
  }

  // Snapshot the fields we need so TS narrowing survives the transaction closure.
  const companyId = lead.companyId;
  const companyName = lead.company.name;
  const personId = lead.contact?.personId ?? null;
  const priorStatus = lead.status;
  const title = lead.serviceInterest?.trim() || `${companyName} — érdeklődés`;
  const value = lead.estimatedValue ?? null;

  // Convert atomically: claim the lead (status != qualified → qualified) and
  // create the deal in one transaction. The conditional updateMany is the race
  // guard — if the lead is already qualified (e.g. a double-click or a second
  // tab), claim.count is 0 and we abort instead of creating a duplicate deal.
  let dealId: number;
  try {
    dealId = await db.$transaction(async (tx) => {
      const claim = await tx.lead.updateMany({
        where: { id: leadId, tenantId: TENANT_ID, status: { not: "qualified" } },
        data: { status: "qualified" },
      });
      if (claim.count === 0) throw new Error("LEAD_ALREADY_QUALIFIED");

      const maxPos = await tx.deal.aggregate({
        where: { tenantId: TENANT_ID, stageId: firstStage.id },
        _max: { position: true },
      });
      const deal = await tx.deal.create({
        data: {
          tenantId: TENANT_ID,
          title,
          companyId,
          personId,
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          value,
          currency: "HUF",
          position: (maxPos._max.position ?? -1) + 1,
        },
        select: { id: true },
      });
      return deal.id;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "LEAD_ALREADY_QUALIFIED") {
      return { error: "A lead már minősített — valószínűleg korábban átalakítva lett" };
    }
    throw e;
  }

  audit("deal", dealId, "create", null, { title, fromLeadId: leadId });
  audit("lead", leadId, "update",
    { status: priorStatus },
    { status: "qualified", convertedToDealId: dealId },
  );

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/deals");
  return { success: true, dealId };
}
