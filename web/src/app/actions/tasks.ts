"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit, diff } from "@/lib/audit";
import { computeCostAmount } from "@/lib/tasks/costing";

const TENANT_ID = 1;

/**
 * Parse the optional cost-line fields off a task form. Cost code carries a
 * measurable amount (quantity × unit rate → HUF) — decisions.md #15. Returns
 * nulls when a field is blank so an empty cost section clears the line.
 */
function parseCostFields(formData: FormData) {
  const num = (key: string): number | null => {
    const raw = (formData.get(key) as string | null)?.trim();
    if (!raw) return null;
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const costCode = ((formData.get("costCode") as string) || "").trim() || null;
  const costQuantity = num("costQuantity");
  const costUnit = ((formData.get("costUnit") as string) || "").trim() || null;
  const costUnitRate = num("costUnitRate");
  const costAmount = computeCostAmount(costQuantity, costUnitRate);
  return { costCode, costQuantity, costUnit, costUnitRate, costAmount };
}

export async function createTask(formData: FormData) {
  const title = formData.get("title") as string;
  if (!title?.trim()) return { error: "Cím kötelező" };

  const dueDateStr   = formData.get("dueDate") as string | null;
  const estStr       = formData.get("estimatedMinutes") as string | null;
  const companyIdStr = formData.get("companyId") as string | null;
  const personIdStr  = formData.get("personId") as string | null;
  const parentIdStr  = formData.get("parentTaskId") as string | null;

  const cost = parseCostFields(formData);

  const task = await db.task.create({
    data: {
      tenantId: TENANT_ID,
      title: title.trim(),
      type: (formData.get("type") as string) || "internal",
      category: (formData.get("category") as string) || null,
      status: "created",
      description: (formData.get("description") as string) || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      estimatedMinutes: estStr ? parseInt(estStr, 10) : null,
      companyId: companyIdStr ? parseInt(companyIdStr, 10) : null,
      personId: personIdStr ? parseInt(personIdStr, 10) : null,
      parentTaskId: parentIdStr ? parseInt(parentIdStr, 10) : null,
      ...cost,
    },
  });

  await audit("task", task.id, "create", null, {
    title: task.title, status: task.status, type: task.type,
    costCode: cost.costCode, costAmount: cost.costAmount,
  });

  revalidatePath("/tasks");
  if (task.companyId) revalidatePath(`/companies/${task.companyId}`);
  if (task.personId)  revalidatePath(`/persons/${task.personId}`);
  return { success: true };
}

export async function updateTask(id: number, formData: FormData) {
  const title = formData.get("title") as string;
  if (!title?.trim()) return { error: "Cím kötelező" };

  const dueDateStr = formData.get("dueDate") as string | null;
  const estStr     = formData.get("estimatedMinutes") as string | null;
  const actualStr  = formData.get("actualMinutes") as string | null;

  const before = await db.task.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { title: true, status: true, type: true, dueDate: true,
              estimatedMinutes: true, description: true, companyId: true, personId: true,
              costCode: true, costAmount: true },
  });

  const newStatus = (formData.get("status") as string) || "created";
  const cost = parseCostFields(formData);

  await db.task.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: {
      title: title.trim(),
      type: (formData.get("type") as string) || "internal",
      category: (formData.get("category") as string) || null,
      status: newStatus,
      description: (formData.get("description") as string) || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      estimatedMinutes: estStr ? parseInt(estStr, 10) : null,
      actualMinutes: actualStr ? parseInt(actualStr, 10) : null,
      ...cost,
      updatedAt: new Date(),
    },
  });

  if (before) {
    const beforeForDiff = {
      ...before,
      costAmount: before.costAmount != null ? Number(before.costAmount) : null,
    };
    const after = {
      title: title.trim(), status: newStatus, type: formData.get("type") || "internal", dueDate: dueDateStr,
      costCode: cost.costCode, costAmount: cost.costAmount,
    };
    const d = diff(beforeForDiff as Record<string, unknown>, after as Record<string, unknown>);
    if (Object.keys(d.after).length > 0) {
      await audit("task", id, "update", d.before, d.after);
    }
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  if (before?.companyId) revalidatePath(`/companies/${before.companyId}`);
  if (before?.personId)  revalidatePath(`/persons/${before.personId}`);
  return { success: true };
}

export async function completeTask(id: number) {
  const before = await db.task.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { status: true, companyId: true, personId: true },
  });
  await db.task.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: { status: "done", completedAt: new Date(), updatedAt: new Date() },
  });
  await audit("task", id, "update", { status: before?.status }, { status: "done" });
  revalidatePath("/tasks");
  if (before?.companyId) revalidatePath(`/companies/${before.companyId}`);
  if (before?.personId)  revalidatePath(`/persons/${before.personId}`);
}

export async function reopenTask(id: number) {
  const before = await db.task.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { status: true, companyId: true, personId: true },
  });
  await db.task.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: { status: "created", completedAt: null, updatedAt: new Date() },
  });
  await audit("task", id, "update", { status: before?.status }, { status: "created" });
  revalidatePath("/tasks");
  if (before?.companyId) revalidatePath(`/companies/${before.companyId}`);
  if (before?.personId)  revalidatePath(`/persons/${before.personId}`);
}

export async function moveTask(id: number, newStatus: string) {
  const task = await db.task.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { status: true, companyId: true, personId: true },
  });
  if (!task) return;

  await db.task.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: {
      status: newStatus,
      completedAt: newStatus === "done" ? new Date() : null,
      updatedAt: new Date(),
    },
  });
  await audit("task", id, "update", { status: task.status }, { status: newStatus });
  revalidatePath("/tasks");
  if (task.companyId) revalidatePath(`/companies/${task.companyId}`);
  if (task.personId)  revalidatePath(`/persons/${task.personId}`);
}

export async function deleteTask(id: number) {
  const task = await db.task.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { title: true, status: true },
  });
  await db.task.deleteMany({ where: { id, tenantId: TENANT_ID } });
  await audit("task", id, "delete", { title: task?.title, status: task?.status }, null);
  revalidatePath("/tasks");
}
