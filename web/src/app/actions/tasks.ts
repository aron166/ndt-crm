"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

const TENANT_ID = 1;

export async function createTask(formData: FormData) {
  const title = formData.get("title") as string;
  if (!title?.trim()) return { error: "Cím kötelező" };

  const dueDateStr    = formData.get("dueDate") as string | null;
  const estStr        = formData.get("estimatedMinutes") as string | null;
  const companyIdStr  = formData.get("companyId") as string | null;
  const personIdStr   = formData.get("personId") as string | null;
  const parentIdStr   = formData.get("parentTaskId") as string | null;

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

  const task = await db.task.findFirst({ where: { id, tenantId: TENANT_ID }, select: { companyId: true, personId: true } });

  await db.task.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: {
      title: title.trim(),
      type: (formData.get("type") as string) || "internal",
      category: (formData.get("category") as string) || null,
      status: (formData.get("status") as string) || "created",
      description: (formData.get("description") as string) || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      estimatedMinutes: estStr ? parseInt(estStr, 10) : null,
      actualMinutes: actualStr ? parseInt(actualStr, 10) : null,
      updatedAt: new Date(),
    },
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  if (task?.companyId) revalidatePath(`/companies/${task.companyId}`);
  if (task?.personId)  revalidatePath(`/persons/${task.personId}`);
  return { success: true };
}

export async function completeTask(id: number) {
  const task = await db.task.findFirst({ where: { id, tenantId: TENANT_ID }, select: { companyId: true, personId: true } });
  await db.task.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: { status: "done", completedAt: new Date(), updatedAt: new Date() },
  });
  revalidatePath("/tasks");
  if (task?.companyId) revalidatePath(`/companies/${task.companyId}`);
  if (task?.personId)  revalidatePath(`/persons/${task.personId}`);
}

export async function reopenTask(id: number) {
  const task = await db.task.findFirst({ where: { id, tenantId: TENANT_ID }, select: { companyId: true, personId: true } });
  await db.task.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: { status: "created", completedAt: null, updatedAt: new Date() },
  });
  revalidatePath("/tasks");
  if (task?.companyId) revalidatePath(`/companies/${task.companyId}`);
  if (task?.personId)  revalidatePath(`/persons/${task.personId}`);
}

export async function deleteTask(id: number) {
  await db.task.deleteMany({ where: { id, tenantId: TENANT_ID } });
  revalidatePath("/tasks");
}
