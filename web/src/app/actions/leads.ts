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
 * linked to the same company + person. Stamps the lead's convertedDealId/
 * convertedAt so it hands off to the deal pipeline (leaves the active leads
 * board, kept for history) and audits the hand-off.
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
  const title = lead.serviceInterest?.trim() || `${companyName} — érdeklődés`;
  const value = lead.estimatedValue ?? null;

  // Convert atomically in one transaction: create the deal, then claim the lead.
  // `convertedDealId` is the single source of truth for "this lead has graduated"
  // — the conditional updateMany is the race guard, so a double-click / second
  // tab that loses the race gets claim.count 0 and throws, rolling back the deal
  // we just created (no duplicate). Once set, the lead leaves the active leads
  // board; the deal is the process tracker from here on. The lead entity is kept
  // (origin/UTM history), linked to its deal, never duplicated across both boards.
  let dealId: number;
  try {
    dealId = await db.$transaction(async (tx) => {
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

      const claim = await tx.lead.updateMany({
        where: { id: leadId, tenantId: TENANT_ID, convertedDealId: null },
        data: { convertedDealId: deal.id, convertedAt: new Date() },
      });
      if (claim.count === 0) throw new Error("LEAD_ALREADY_CONVERTED");

      return deal.id;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "LEAD_ALREADY_CONVERTED") {
      return { error: "A lead már át lett alakítva deallé" };
    }
    throw e;
  }

  audit("deal", dealId, "create", null, { title, fromLeadId: leadId });
  audit("lead", leadId, "update",
    { convertedDealId: null },
    { convertedDealId: dealId },
  );

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/deals");
  return { success: true, dealId };
}
