"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

const TENANT_ID = 1;

export async function createTask(formData: FormData) {
  const title = formData.get("title") as string;
  if (!title?.trim()) return { error: "Title required" };

  const dueDateStr = formData.get("dueDate") as string | null;
  const estStr = formData.get("estimatedMinutes") as string | null;
  const companyIdStr = formData.get("companyId") as string | null;
  const personIdStr = formData.get("personId") as string | null;
  const parentIdStr = formData.get("parentTaskId") as string | null;

  await db.task.create({
    data: {
      tenantId: TENANT_ID,
      title: title.trim(),
      type: (formData.get("type") as string) || "internal",
      category: (formData.get("category") as string) || "internal",
      status: "not_started",
      description: (formData.get("description") as string) || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      estimatedMinutes: estStr ? parseInt(estStr, 10) : null,
      companyId: companyIdStr ? parseInt(companyIdStr, 10) : null,
      personId: personIdStr ? parseInt(personIdStr, 10) : null,
      parentTaskId: parentIdStr ? parseInt(parentIdStr, 10) : null,
    },
  });

  revalidatePath("/tasks");
  return { success: true };
}

export async function updateTask(id: number, formData: FormData) {
  const title = formData.get("title") as string;
  if (!title?.trim()) return { error: "Title required" };

  const dueDateStr = formData.get("dueDate") as string | null;
  const estStr = formData.get("estimatedMinutes") as string | null;
  const actualStr = formData.get("actualMinutes") as string | null;

  await db.task.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: {
      title: title.trim(),
      type: (formData.get("type") as string) || "internal",
      category: (formData.get("category") as string) || "internal",
      status: (formData.get("status") as string) || "not_started",
      description: (formData.get("description") as string) || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      estimatedMinutes: estStr ? parseInt(estStr, 10) : null,
      actualMinutes: actualStr ? parseInt(actualStr, 10) : null,
      updatedAt: new Date(),
    },
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  return { success: true };
}

export async function completeTask(id: number) {
  await db.task.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: { status: "done", completedAt: new Date(), updatedAt: new Date() },
  });
  revalidatePath("/tasks");
}

export async function reopenTask(id: number) {
  await db.task.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: { status: "not_started", completedAt: null, updatedAt: new Date() },
  });
  revalidatePath("/tasks");
}

export async function deleteTask(id: number) {
  await db.task.deleteMany({ where: { id, tenantId: TENANT_ID } });
  revalidatePath("/tasks");
}
