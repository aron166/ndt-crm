"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";

const TENANT_ID = 1;

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** A tenant-unique slug: base, then base-2, base-3… (the table enforces uniqueness). */
async function uniqueSlug(base: string): Promise<string> {
  const root = base || "kampany";
  const taken = new Set(
    (await db.campaign.findMany({
      where: { tenantId: TENANT_ID, slug: { startsWith: root } },
      select: { slug: true },
    })).map((c) => c.slug),
  );
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) {
    const candidate = `${root}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function revalidate(id?: number) {
  revalidatePath("/marketing/campaigns");
  if (id) revalidatePath(`/marketing/campaigns/${id}`);
}

export async function createCampaign(input: { name: string; description?: string }) {
  const name = input.name?.trim();
  if (!name) return { error: "A kampány neve kötelező" };

  const slug = await uniqueSlug(slugify(name));
  const campaign = await db.campaign.create({
    data: {
      tenantId: TENANT_ID,
      name,
      slug,
      description: input.description?.trim() || null,
    },
    select: { id: true },
  });
  audit("campaign", campaign.id, "create", null, { name, slug });
  revalidate(campaign.id);
  return { success: true, id: campaign.id };
}

export async function updateCampaign(id: number, input: { name: string; description?: string }) {
  const campaign = await db.campaign.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { id: true, name: true, description: true },
  });
  if (!campaign) return { error: "Kampány nem található" };

  const name = input.name?.trim();
  if (!name) return { error: "A kampány neve kötelező" };
  const description = input.description?.trim() || null;

  await db.campaign.update({ where: { id }, data: { name, description } });
  audit("campaign", id, "update",
    { name: campaign.name, description: campaign.description },
    { name, description },
  );
  revalidate(id);
  return { success: true };
}

/** Set (or clear, when viewId is null) the campaign's target audience segment. */
export async function setCampaignAudience(id: number, viewId: number | null) {
  const campaign = await db.campaign.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { id: true, audienceViewId: true },
  });
  if (!campaign) return { error: "Kampány nem található" };

  if (viewId !== null) {
    // Only a COMPANY saved view of the same tenant can be an audience.
    const view = await db.savedView.findFirst({
      where: { id: viewId, tenantId: TENANT_ID, entityType: "company" },
      select: { id: true },
    });
    if (!view) return { error: "A kiválasztott szegmens nem érvényes" };
  }

  await db.campaign.update({ where: { id }, data: { audienceViewId: viewId } });
  audit("campaign", id, "update",
    { audienceViewId: campaign.audienceViewId },
    { audienceViewId: viewId },
  );
  revalidate(id);
  return { success: true };
}

export async function setCampaignArchived(id: number, isArchived: boolean) {
  const campaign = await db.campaign.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { id: true, isArchived: true },
  });
  if (!campaign) return { error: "Kampány nem található" };

  await db.campaign.update({ where: { id }, data: { isArchived } });
  audit("campaign", id, "update", { isArchived: campaign.isArchived }, { isArchived });
  revalidate(id);
  return { success: true };
}
