"use server";
import { TENANT_ID } from "@/lib/tenant";

import { normalizeStatus } from "@/lib/import/normalize";
import { db } from "@/lib/db";
import { requireCrmUser } from "@/lib/actor";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { buildCompanyChanges, buildPersonChanges, type ChangesMap } from "@/lib/enrichment/sources";

export type { FieldChange, ChangesMap } from "@/lib/enrichment/sources";

// ─── Bulk trigger ─────────────────────────────────────────────────────────────

export async function triggerBulkEnrichment(
  entityType: "company" | "person",
  entityIds: number[],
): Promise<number> {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) throw new Error(denied);
  const cappedIds = entityIds.slice(0, 20);

  const run = await db.enrichmentRun.create({
    data: { tenantId: TENANT_ID, entityType, entityIds: cappedIds, status: "running", startedAt: new Date() },
  });

  for (const entityId of cappedIds) {
    try {
      if (entityType === "company") {
        const company = await db.company.findFirst({
          where: { id: entityId, tenantId: TENANT_ID },
          select: { id: true, name: true, vatNumber: true, city: true, website: true, status: true, address: true, country: true },
        });
        if (!company) continue;

        const { changes, rawResponse } = await buildCompanyChanges(company);
        await db.enrichmentProposal.create({
          data: {
            tenantId: TENANT_ID, runId: run.id, entityType, entityId,
            entityName: company.name,
            changes: changes as unknown as object,
            overallStatus: Object.keys(changes).length > 0 ? "pending" : "rejected",
            rawResponse,
          },
        });
      } else {
        const person = await db.person.findFirst({
          where: { id: entityId, tenantId: TENANT_ID },
          select: { id: true, firstName: true, lastName: true, email: true, linkedinUrl: true, notes: true },
        });
        if (!person) continue;

        const activeContact = await db.contact.findFirst({
          where: { personId: entityId, tenantId: TENANT_ID, endedAt: null },
          include: { company: { select: { name: true } } },
        });
        const currentEmployer = activeContact
          ? { companyName: activeContact.company.name, role: activeContact.role }
          : null;

        const { changes, rawResponse } = await buildPersonChanges(person, currentEmployer);
        await db.enrichmentProposal.create({
          data: {
            tenantId: TENANT_ID, runId: run.id, entityType, entityId,
            entityName: `${person.firstName} ${person.lastName}`,
            changes: changes as unknown as object,
            overallStatus: Object.keys(changes).length > 0 ? "pending" : "rejected",
            rawResponse,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const fallbackName = entityType === "company"
        ? ((await db.company.findFirst({ where: { id: entityId, tenantId: TENANT_ID }, select: { name: true } }))?.name ?? String(entityId))
        : String(entityId);
      await db.enrichmentProposal.create({
        data: {
          tenantId: TENANT_ID, runId: run.id, entityType, entityId,
          entityName: fallbackName,
          changes: {},
          overallStatus: "rejected",
          rawResponse: `ERROR: ${message}`,
        },
      });
    }
  }

  await db.enrichmentRun.update({
    where: { id: run.id },
    data: { status: "done", finishedAt: new Date() },
  });

  revalidatePath("/enrichment");
  return run.id;
}

// ─── Apply proposal ───────────────────────────────────────────────────────────

export async function applyProposal(proposalId: number, approvedFields: string[]): Promise<void> {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) throw new Error(denied);
  const proposal = await db.enrichmentProposal.findFirst({
    where: { id: proposalId, tenantId: TENANT_ID },
  });
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  const changes = proposal.changes as unknown as ChangesMap;
  const allFields = Object.keys(changes);
  const updateData: Record<string, unknown> = {};
  approvedFields = [...approvedFields];
  for (const field of [...approvedFields]) {
    if (!changes[field]) continue;
    let proposed: unknown = changes[field].proposed;
    if (field === "status" && proposal.entityType === "company") {
      proposed = normalizeStatus(String(proposed ?? ""));
      if (!proposed) { // unknown or blank: not written, so recorded as rejected
        approvedFields = approvedFields.filter((f) => f !== field);
        continue;
      }
    }
    updateData[field] = proposed;
  }

  if (Object.keys(updateData).length > 0) {
    if (proposal.entityType === "company") {
      const before = await db.company.findFirst({ where: { id: proposal.entityId, tenantId: TENANT_ID } });
      if (!before) throw new Error(`Company ${proposal.entityId} not found`);
      await db.company.update({ where: { id: proposal.entityId }, data: updateData });
      audit("company", proposal.entityId, "update",
        before as unknown as Record<string, unknown>,
        { ...updateData, _enrichmentProposalId: proposalId });
      revalidatePath(`/companies/${proposal.entityId}`);
    } else {
      const before = await db.person.findFirst({ where: { id: proposal.entityId, tenantId: TENANT_ID } });
      if (!before) throw new Error(`Person ${proposal.entityId} not found`);
      await db.person.update({ where: { id: proposal.entityId }, data: updateData });
      audit("person", proposal.entityId, "update",
        before as unknown as Record<string, unknown>,
        { ...updateData, _enrichmentProposalId: proposalId });
      revalidatePath(`/persons/${proposal.entityId}`);
    }
  }

  const updatedChanges: ChangesMap = {};
  for (const field of allFields) {
    updatedChanges[field] = { ...changes[field], status: approvedFields.includes(field) ? "approved" : "rejected" };
  }

  const approvedCount = approvedFields.length;
  const rejectedCount = allFields.length - approvedCount;

  await db.enrichmentProposal.update({
    where: { id: proposalId },
    data: {
      changes: updatedChanges as unknown as object,
      overallStatus: approvedCount === 0 ? "rejected" : rejectedCount === 0 ? "approved" : "partial",
    },
  });

  revalidatePath("/enrichment");
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

export async function getProposalsByRun(runId: number) {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) throw new Error(denied);
  return db.enrichmentProposal.findMany({
    where: { tenantId: TENANT_ID, runId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getEnrichmentRuns() {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) throw new Error(denied);
  return db.enrichmentRun.findMany({
    where: { tenantId: TENANT_ID },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { proposals: true } } },
  });
}

export async function getPendingProposals() {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) throw new Error(denied);
  return db.enrichmentProposal.findMany({
    where: { tenantId: TENANT_ID, overallStatus: { in: ["pending", "rejected"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { run: { select: { entityType: true, triggeredBy: true } } },
  });
}
