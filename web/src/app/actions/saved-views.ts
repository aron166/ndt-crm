"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";

// A saved COMPANY view is now also a campaign's outreach target list
// (campaigns.audience_view_id), so these actions decide who gets cold-emailed.
// They had no auth check and deleteSavedView had no tenant scope either: it
// deleted by bare id. A server action is callable by id regardless of the
// (app) layout's login redirect, so that was a delete-anything primitive.

const TENANT_ID = 1;

async function requireUser(): Promise<{ error: string } | null> {
  const { userId } = await getActor(TENANT_ID);
  return userId == null ? { error: NOT_A_CRM_USER } : null;
}

export type ViewEntityType = "company" | "person" | "deal" | "task";

export async function getSavedViews(entityType: ViewEntityType) {
  if (await requireUser()) return [];
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
  const denied = await requireUser();
  if (denied) return denied;

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

export async function deleteSavedView(id: number): Promise<{ error?: string; success?: true }> {
  const denied = await requireUser();
  if (denied) return denied;

  // Deleting a view that a campaign points at sets campaigns.audience_view_id
  // to NULL (onDelete: SetNull), and a campaign with no audience targets the
  // whole callable universe. Tidying up saved views on a Monday would then
  // quietly turn a 30 company segment into every company we are allowed to
  // contact. Refuse instead, and name the campaigns.
  const view = await db.savedView.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { id: true, campaignAudiences: { select: { name: true } } },
  });
  if (!view) return { error: "A nézet nem található" };
  if (view.campaignAudiences.length > 0) {
    // PROPOSAL (unreviewed HU)
    return {
      error: `Ez a nézet egy kampány kimenő listája (${view.campaignAudiences.map((c) => c.name).join(", ")}). Előbb vedd le a kampányról.`,
    };
  }

  await db.savedView.delete({ where: { id } });
  revalidatePath("/companies");
  revalidatePath("/persons");
  revalidatePath("/deals");
  revalidatePath("/tasks");
  revalidatePath("/marketing/campaigns");
  return { success: true };
}
