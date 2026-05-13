"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

const TENANT_ID = 1;

export async function saveIntegrationCredential(slug: string, credentials: Record<string, string>) {
  if (!slug || Object.keys(credentials).length === 0) return { error: "Hiányzó adatok" };

  await db.integrationCredential.upsert({
    where: { tenantId_integrationSlug: { tenantId: TENANT_ID, integrationSlug: slug } },
    update: { credentials: credentials as Prisma.InputJsonValue, isActive: true },
    create: { tenantId: TENANT_ID, integrationSlug: slug, credentials: credentials as Prisma.InputJsonValue },
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function disconnectIntegration(slug: string) {
  await db.integrationCredential.updateMany({
    where: { tenantId: TENANT_ID, integrationSlug: slug },
    data: { isActive: false },
  });
  revalidatePath("/settings");
}
