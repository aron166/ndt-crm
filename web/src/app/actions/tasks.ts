"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit, diff } from "@/lib/audit";

const TENANT_ID = 1;

export async function createTask(formData: FormData) {
  const title = formData.get("title") as string;
  if (!title?.trim()) return { error: "Cím kötelező" };

  const dueDateStr   = formData.get("dueDate") as string | null;
  const estStr       = formData.get("estimatedMinutes") as string | null;
  const companyIdStr = formData.get("companyId") as string | null;
  const personIdStr  = formData.get("personId") as string | null;
  const parentIdStr  = formData.get("parentTaskId") as string | null;

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
    },
  });

  await audit("task", task.id, "create", null, { title: task.title, status: task.status, type: task.type });

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
              estimatedMinutes: true, description: true, companyId: true, personId: true },
  });

  const newStatus = (formData.get("status") as string) || "created";

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
      updatedAt: new Date(),
    },
  });

  if (before) {
    const after = { title: title.trim(), status: newStatus, type: formData.get("type") || "internal", dueDate: dueDateStr };
    const d = diff(before as Record<string, unknown>, after as Record<string, unknown>);
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

export async function deleteTask(id: number) {
  const task = await db.task.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { title: true, status: true },
  });
  await db.task.deleteMany({ where: { id, tenantId: TENANT_ID } });
  await audit("task", id, "delete", { title: task?.title, status: task?.status }, null);
  revalidatePath("/tasks");
}
