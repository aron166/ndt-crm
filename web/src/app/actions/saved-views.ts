"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

const TENANT_ID = 1;

export type ViewEntityType = "company" | "person" | "deal" | "task";

export async function getSavedViews(entityType: ViewEntityType) {
  return db.savedView.findMany({
    where: { tenantId: TENANT_ID, entityType },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function createSavedView(
  entityType: ViewEntityType,
  name: string,
  filters: Record<string, string>
) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Név kötelező" };

  await db.savedView.create({
    data: {
      tenantId: TENANT_ID,
      entityType,
      name: trimmed,
      filters: filters as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/${entityType === "company" ? "companies" : entityType + "s"}`);
  return { success: true };
}

export async function deleteSavedView(id: number) {
  await db.savedView.delete({ where: { id } });
  revalidatePath("/companies");
  revalidatePath("/persons");
  revalidatePath("/deals");
  revalidatePath("/tasks");
}
