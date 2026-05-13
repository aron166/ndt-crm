"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { encrypt } from "@/lib/crypto";

const TENANT_ID = 1;

export async function saveIntegrationCredential(slug: string, credentials: Record<string, string>) {
  if (!slug || Object.keys(credentials).length === 0) return { error: "Hiányzó adatok" };

  // Encrypt every value before storing — keys stay as plaintext labels
  const encrypted: Record<string, string> = {};
  for (const [k, v] of Object.entries(credentials)) {
    encrypted[k] = encrypt(v);
  }

  await db.integrationCredential.upsert({
    where: { tenantId_integrationSlug: { tenantId: TENANT_ID, integrationSlug: slug } },
    update: { credentials: encrypted as Prisma.InputJsonValue, isActive: true },
    create: { tenantId: TENANT_ID, integrationSlug: slug, credentials: encrypted as Prisma.InputJsonValue },
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
