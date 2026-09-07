"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { encrypt } from "@/lib/crypto";
import { audit } from "@/lib/audit";

const TENANT_ID = 1;

export async function saveIntegrationCredential(slug: string, credentials: Record<string, string>) {
  if (!slug || Object.keys(credentials).length === 0) return { error: "Hiányzó adatok" };

  // Encrypt every value before storing — keys stay as plaintext labels
  const encrypted: Record<string, string> = {};
  for (const [k, v] of Object.entries(credentials)) {
    encrypted[k] = encrypt(v);
  }

  // Was this an existing credential? Drives create-vs-update on the audit row.
  const existing = await db.integrationCredential.findUnique({
    where: { tenantId_integrationSlug: { tenantId: TENANT_ID, integrationSlug: slug } },
    select: { id: true },
  });

  const saved = await db.integrationCredential.upsert({
    where: { tenantId_integrationSlug: { tenantId: TENANT_ID, integrationSlug: slug } },
    update: { credentials: encrypted as Prisma.InputJsonValue, isActive: true },
    create: { tenantId: TENANT_ID, integrationSlug: slug, credentials: encrypted as Prisma.InputJsonValue },
  });

  // SECURITY: never put the credential values (API keys) into the audit trail —
  // only the slug and which keys were set, plus active state.
  audit(
    "integration_credential",
    saved.id,
    existing ? "update" : "create",
    existing ? { integrationSlug: slug } : null,
    { integrationSlug: slug, keys: Object.keys(credentials), isActive: true },
  );

  revalidatePath("/settings");
  return { success: true };
}

export async function disconnectIntegration(slug: string) {
  const existing = await db.integrationCredential.findUnique({
    where: { tenantId_integrationSlug: { tenantId: TENANT_ID, integrationSlug: slug } },
    select: { id: true, isActive: true },
  });

  await db.integrationCredential.updateMany({
    where: { tenantId: TENANT_ID, integrationSlug: slug },
    data: { isActive: false },
  });

  if (existing) {
    audit(
      "integration_credential",
      existing.id,
      "update",
      { integrationSlug: slug, isActive: existing.isActive },
      { integrationSlug: slug, isActive: false },
    );
  }
  revalidatePath("/settings");
}
