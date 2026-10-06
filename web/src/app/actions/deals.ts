"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { runAutomations } from "@/lib/automations/engine";
import { deleteCompany } from "@/app/actions/companies";
import { deletePerson } from "@/app/actions/persons";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";

const TENANT_ID = 1;

// Every export is a server action, callable by id regardless of the layout
// redirect: refuse non-CRM users before any DB access. Returns the message and
// each action builds its own literal, so TypeScript's union normalisation of
// object-literal returns keeps working (see tasks.ts).
async function requireUser(): Promise<string | null> {
  const { userId } = await getActor(TENANT_ID);
  return userId == null ? NOT_A_CRM_USER : null;
}

// Foreign ids taken from input must belong to this tenant before they are
// written onto a deal. Returns an error message or null.
async function foreignIdError(ids: {
  companyId?: number | null; personId?: number | null; pipelineId?: number | null; stageId?: number | null;
}): Promise<string | null> {
  const { companyId, personId, pipelineId, stageId } = ids;
  if (companyId != null && !(await db.company.findFirst({ where: { id: companyId, tenantId: TENANT_ID }, select: { id: true } }))) return "Cég nem található";
  if (personId != null && !(await db.person.findFirst({ where: { id: personId, tenantId: TENANT_ID }, select: { id: true } }))) return "Személy nem található";
  if (pipelineId != null && !(await db.pipeline.findFirst({ where: { id: pipelineId, tenantId: TENANT_ID }, select: { id: true } }))) return "Pipeline nem található";
  if (stageId != null && !(await db.pipelineStage.findFirst({ where: { id: stageId, pipeline: { tenantId: TENANT_ID } }, select: { id: true } }))) return "Szakasz nem található";
  return null;
}

export async function createDeal(formData: FormData) {
  const denied = await requireUser();
  if (denied) return { error: denied };
  const title      = (formData.get("title") as string)?.trim();
  const companyIdStr = formData.get("companyId") as string;
  const pipelineIdStr = formData.get("pipelineId") as string;
  const stageIdStr   = formData.get("stageId") as string;
  const valueStr     = formData.get("value") as string | null;
  const personIdStr  = formData.get("personId") as string | null;
  const closeDate    = formData.get("expectedCloseDate") as string | null;

  if (!title) return { error: "Cím kötelező" };
  if (!companyIdStr) return { error: "Cég kötelező" };

  // collect custom field values (prefixed cf_)
  const customFields: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("cf_") && String(v).trim()) customFields[k.slice(3)] = String(v);
  }

  const refErr = await foreignIdError({
    companyId: parseInt(companyIdStr),
    personId: personIdStr ? parseInt(personIdStr) : null,
    pipelineId: pipelineIdStr ? parseInt(pipelineIdStr) : null,
    stageId: stageIdStr ? parseInt(stageIdStr) : null,
  });
  if (refErr) return { error: refErr };

  // position = max existing + 1
  const maxPos = await db.deal.aggregate({
    where: { tenantId: TENANT_ID, stageId: stageIdStr ? parseInt(stageIdStr) : null },
    _max: { position: true },
  });

  const deal = await db.deal.create({
    data: {
      tenantId: TENANT_ID,
      title,
      companyId: parseInt(companyIdStr),
      pipelineId: pipelineIdStr ? parseInt(pipelineIdStr) : null,
      stageId: stageIdStr ? parseInt(stageIdStr) : null,
      personId: personIdStr ? parseInt(personIdStr) : null,
      value: valueStr ? parseFloat(valueStr) : null,
      currency: "HUF",
      expectedCloseDate: closeDate ? new Date(closeDate) : null,
      position: (maxPos._max.position ?? -1) + 1,
      stageEnteredAt: new Date(),
      ...(Object.keys(customFields).length > 0 ? { customFields } : {}),
    },
  });

  audit("deal", deal.id, "create", null, { title, stageId: deal.stageId });
  revalidatePath("/deals");
  return { success: true, dealId: deal.id };
}

export async function updateDeal(id: number, formData: FormData) {
  const denied = await requireUser();
  if (denied) return { error: denied };
  const title     = (formData.get("title") as string)?.trim();
  if (!title) return { error: "Cím kötelező" };

  const valueStr  = formData.get("value") as string | null;
  const closeDate = formData.get("expectedCloseDate") as string | null;
  const personIdStr = formData.get("personId") as string | null;
  const stageIdStr  = formData.get("stageId") as string | null;

  const customFields: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("cf_") && String(v).trim()) customFields[k.slice(3)] = String(v);
  }

  const refErr = await foreignIdError({
    personId: personIdStr ? parseInt(personIdStr) : null,
    stageId: stageIdStr ? parseInt(stageIdStr) : null,
  });
  if (refErr) return { error: refErr };

  const before = await db.deal.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { title: true, stageId: true, value: true, customFields: true },
  });

  await db.deal.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: {
      title,
      value: valueStr ? parseFloat(valueStr) : null,
      expectedCloseDate: closeDate ? new Date(closeDate) : null,
      personId: personIdStr ? parseInt(personIdStr) : null,
      stageId: stageIdStr ? parseInt(stageIdStr) : null,
      ...(Object.keys(customFields).length > 0 ? { customFields: { ...(before?.customFields as Record<string, string> ?? {}), ...customFields } } : {}),
      updatedAt: new Date(),
    },
  });

  if (before) audit("deal", id, "update", { title: before.title }, { title });
  revalidatePath("/deals");
  return { success: true };
}

export async function moveDeal(
  dealId: number,
  newStageId: number,
  newPosition: number
) {
  const denied = await requireUser();
  if (denied) throw new Error(denied);
  const deal = await db.deal.findFirst({
    where: { id: dealId, tenantId: TENANT_ID },
    select: {
      stageId: true, companyId: true, personId: true, value: true,
      stage: { select: { name: true } },
      company: { select: { name: true } },
    },
  });

  const newStage = await db.pipelineStage.findFirst({
    where: { id: newStageId, pipeline: { tenantId: TENANT_ID } },
    select: { name: true },
  });
  if (!newStage) throw new Error("Szakasz nem található");

  // Only a real stage change resets the idle clock (drags within the same
  // column reorder but keep the deal in its stage).
  const stageChanged = !!deal && deal.stageId !== newStageId;

  await db.deal.updateMany({
    where: { id: dealId, tenantId: TENANT_ID },
    data: {
      stageId: newStageId, position: newPosition, updatedAt: new Date(),
      ...(stageChanged ? { stageEnteredAt: new Date() } : {}),
    },
  });

  audit("deal", dealId, "update",
    { stageId: deal?.stageId, stageName: deal?.stage?.name },
    { stageId: newStageId, stageName: newStage?.name }
  );

  if (stageChanged && deal) {
    await runAutomations({
      type: "deal_stage_changed",
      tenantId: TENANT_ID,
      companyId: deal.companyId,
      personId: deal.personId,
      dealId,
      companyName: deal.company?.name ?? null,
      toStageId: newStageId,
      fields: {
        company: deal.company?.name ?? null,
        stageId: newStageId,
        value: deal.value != null ? Number(deal.value) : null,
      },
    });
  }

  revalidatePath("/deals");
}

export async function deleteDeal(
  id: number,
  // Optional cascade: also soft-delete the linked company / person. Both are
  // recoverable (deletedAt + restore), so this stays non-destructive.
  cascade?: { company?: boolean; person?: boolean },
) {
  const denied = await requireUser();
  if (denied) throw new Error(denied);
  const before = await db.deal.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { title: true, stageId: true, value: true, companyId: true, personId: true },
  });

  await db.deal.deleteMany({ where: { id, tenantId: TENANT_ID } });

  if (before) audit("deal", id, "delete", before, null);

  if (cascade?.company && before?.companyId) await deleteCompany(before.companyId);
  if (cascade?.person && before?.personId) await deletePerson(before.personId);

  revalidatePath("/deals");
}

// ── Pipeline management ────────────────────────────────────────

export async function createPipeline(formData: FormData) {
  const denied = await requireUser();
  if (denied) return { error: denied };
  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Név kötelező" };

  const pipeline = await db.pipeline.create({
    data: { tenantId: TENANT_ID, name, position: 0 },
  });
  revalidatePath("/deals");
  return { success: true, pipelineId: pipeline.id };
}

export async function upsertStage(formData: FormData) {
  const denied = await requireUser();
  if (denied) return { error: denied };
  const pipelineId  = parseInt(formData.get("pipelineId") as string);
  const stageIdStr  = formData.get("stageId") as string | null;
  const name        = (formData.get("name") as string)?.trim();
  const color       = (formData.get("color") as string) || "#6366f1";
  const probability = parseInt(formData.get("probability") as string) || 50;
  const position    = parseInt(formData.get("position") as string) || 0;
  const isTerminalWon  = formData.get("isTerminalWon") === "true";
  const isTerminalLost = formData.get("isTerminalLost") === "true";

  if (!name) return { error: "Név kötelező" };

  if (stageIdStr) {
    await db.pipelineStage.updateMany({
      where: { id: parseInt(stageIdStr), pipeline: { tenantId: TENANT_ID } },
      data: { name, color, probability, position, isTerminalWon, isTerminalLost },
    });
  } else {
    const pipeline = await db.pipeline.findFirst({
      where: { id: pipelineId, tenantId: TENANT_ID },
      select: { id: true },
    });
    if (!pipeline) return { error: "Pipeline nem található" };
    await db.pipelineStage.create({
      data: { pipelineId, name, color, probability, position, isTerminalWon, isTerminalLost },
    });
  }

  revalidatePath("/deals/setup");
  return { success: true };
}

export async function reorderStages(pipelineId: number, orderedIds: number[]) {
  const denied = await requireUser();
  if (denied) return { error: denied };
  // Verify the pipeline belongs to this tenant before touching its stages —
  // app-level scoping is the only multi-tenant guard (ADR/002).
  const pipeline = await db.pipeline.findFirst({
    where: { id: pipelineId, tenantId: TENANT_ID },
    select: { id: true },
  });
  if (!pipeline) return { error: "Pipeline nem található" };

  // Persist the new column order. Scope each update to the pipeline so a stray
  // id from another pipeline can't be repositioned.
  await db.$transaction(
    orderedIds.map((id, index) =>
      db.pipelineStage.updateMany({
        where: { id, pipelineId },
        data: { position: index },
      }),
    ),
  );
  revalidatePath("/deals/setup");
  revalidatePath("/deals");
  return { success: true };
}

export async function deleteStage(stageId: number) {
  const denied = await requireUser();
  if (denied) throw new Error(denied);
  const stage = await db.pipelineStage.findFirst({
    where: { id: stageId, pipeline: { tenantId: TENANT_ID } },
    select: { id: true },
  });
  if (!stage) return;

  // Move deals in this stage to null stage first
  await db.deal.updateMany({
    where: { stageId, tenantId: TENANT_ID },
    data: { stageId: null },
  });
  await db.pipelineStage.delete({ where: { id: stageId } });
  revalidatePath("/deals/setup");
  revalidatePath("/deals");
}
