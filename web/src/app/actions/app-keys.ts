"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { generateAppKey, hashAppKey } from "@/lib/app-key-auth";

const TENANT_ID = 1;

export interface AppKeyRow {
  id: number;
  appSlug: string;
  label: string | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listAppApiKeys(): Promise<AppKeyRow[]> {
  const keys = await db.appApiKey.findMany({
    where: { tenantId: TENANT_ID },
    orderBy: { createdAt: "desc" },
    select: { id: true, appSlug: true, label: true, isActive: true, createdAt: true, lastUsedAt: true },
  });
  return keys.map((k) => ({
    ...k,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
  }));
}

/**
 * Create a new per-app API key. The plaintext is returned ONCE here and never
 * stored — only its SHA-256 hash is persisted.
 */
export async function createAppApiKey(appSlug: string, label?: string) {
  const slug = appSlug?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!slug) return { error: "App azonosító kötelező" };

  const plaintext = generateAppKey();
  const keyHash = hashAppKey(plaintext);

  const key = await db.appApiKey.create({
    data: {
      tenantId: TENANT_ID,
      appSlug: slug,
      keyHash,
      label: label?.trim() || null,
    },
    select: { id: true, appSlug: true },
  });

  audit("integration_credential", key.id, "create",
    null,
    { appSlug: key.appSlug }, // secret NEVER logged
  );

  revalidatePath("/settings");
  return { success: true, plaintext, id: key.id, appSlug: key.appSlug };
}

export async function revokeAppApiKey(id: number) {
  const key = await db.appApiKey.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { id: true, appSlug: true, isActive: true },
  });
  if (!key) return { error: "Kulcs nem található" };

  await db.appApiKey.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: { isActive: false },
  });

  audit("integration_credential", id, "update",
    { isActive: key.isActive },
    { isActive: false, revoked: true, appSlug: key.appSlug },
  );

  revalidatePath("/settings");
  return { success: true };
}
