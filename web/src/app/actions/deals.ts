"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";

const TENANT_ID = 1;

export async function createDeal(formData: FormData) {
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
      ...(Object.keys(customFields).length > 0 ? { customFields } : {}),
    },
  });

  audit("task", deal.id, "create", null, { title, stageId: deal.stageId });
  revalidatePath("/deals");
  return { success: true, dealId: deal.id };
}

export async function updateDeal(id: number, formData: FormData) {
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

  if (before) audit("task", id, "update", { title: before.title }, { title });
  revalidatePath("/deals");
  return { success: true };
}

export async function moveDeal(
  dealId: number,
  newStageId: number,
  newPosition: number
) {
  const deal = await db.deal.findFirst({
    where: { id: dealId, tenantId: TENANT_ID },
    select: { stageId: true, stage: { select: { name: true } } },
  });

  const newStage = await db.pipelineStage.findUnique({
    where: { id: newStageId },
    select: { name: true },
  });

  await db.deal.updateMany({
    where: { id: dealId, tenantId: TENANT_ID },
    data: { stageId: newStageId, position: newPosition, updatedAt: new Date() },
  });

  audit("task", dealId, "update",
    { stageId: deal?.stageId, stageName: deal?.stage?.name },
    { stageId: newStageId, stageName: newStage?.name }
  );
  revalidatePath("/deals");
}

export async function deleteDeal(id: number) {
  await db.deal.deleteMany({ where: { id, tenantId: TENANT_ID } });
  revalidatePath("/deals");
}

// ── Pipeline management ────────────────────────────────────────

export async function createPipeline(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Név kötelező" };

  const pipeline = await db.pipeline.create({
    data: { tenantId: TENANT_ID, name, position: 0 },
  });
  revalidatePath("/deals");
  return { success: true, pipelineId: pipeline.id };
}

export async function upsertStage(formData: FormData) {
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
    await db.pipelineStage.update({
      where: { id: parseInt(stageIdStr) },
      data: { name, color, probability, position, isTerminalWon, isTerminalLost },
    });
  } else {
    await db.pipelineStage.create({
      data: { pipelineId, name, color, probability, position, isTerminalWon, isTerminalLost },
    });
  }

  revalidatePath("/deals/setup");
  return { success: true };
}

export async function deleteStage(stageId: number) {
  // Move deals in this stage to null stage first
  await db.deal.updateMany({
    where: { stageId, tenantId: TENANT_ID },
    data: { stageId: null },
  });
  await db.pipelineStage.delete({ where: { id: stageId } });
  revalidatePath("/deals/setup");
  revalidatePath("/deals");
}
