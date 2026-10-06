"use server";

import { db } from "@/lib/db";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";

const TENANT_ID = 1;

// Same gate as tasks.ts / automations.ts. Returns the MESSAGE, not an
// `{ error }` object, so each action builds its own literal (keeps TypeScript's
// union normalisation intact for call sites).
async function requireUser(): Promise<string | null> {
  const { userId } = await getActor(TENANT_ID);
  return userId == null ? NOT_A_CRM_USER : null;
}

export type TaggableType = "company" | "person" | "deal" | "task" | "interaction";

function revalidateEntity(type: TaggableType, id: number) {
  if (type === "company")  revalidatePath(`/companies/${id}`);
  if (type === "person")   revalidatePath(`/persons/${id}`);
  if (type === "task")     revalidatePath(`/tasks/${id}`);
}

// Taggings carry no tenantId: the tag is tenant-scoped (tenantId_name), and the
// tagged entity is verified here before anything is linked or unlinked.
async function entityInTenant(type: TaggableType, id: number): Promise<boolean> {
  const where = { id, tenantId: TENANT_ID };
  const select = { id: true };
  switch (type) {
    case "company": return !!(await db.company.findFirst({ where, select }));
    case "person": return !!(await db.person.findFirst({ where, select }));
    case "deal": return !!(await db.deal.findFirst({ where, select }));
    case "task": return !!(await db.task.findFirst({ where, select }));
    case "interaction": return !!(await db.interaction.findFirst({ where, select }));
    default: return false;
  }
}

export async function addTag(
  taggableType: TaggableType,
  taggableId: number,
  name: string,
  color?: string
) {
  const denied = await requireUser();
  if (denied) return { error: denied };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Üres tag" };
  if (!(await entityInTenant(taggableType, taggableId))) return { error: "Nem található" };

  const tag = await db.tag.upsert({
    where: { tenantId_name: { tenantId: TENANT_ID, name: trimmed } },
    update: {},
    create: { tenantId: TENANT_ID, name: trimmed, color: color ?? "#6366f1" },
  });

  const tagging = await db.tagging.upsert({
    where: { tagId_taggableType_taggableId: { tagId: tag.id, taggableType, taggableId } },
    update: {},
    create: { tagId: tag.id, taggableType, taggableId },
  });

  audit("tagging", tagging.id, "create", null, {
    tagId: tag.id, tagName: trimmed, taggableType, taggableId,
  });

  revalidateEntity(taggableType, taggableId);
  return { success: true, tag };
}

export async function removeTag(
  taggableType: TaggableType,
  taggableId: number,
  tagId: number
) {
  const denied = await requireUser();
  if (denied) return { error: denied };
  const tag = await db.tag.findFirst({ where: { id: tagId, tenantId: TENANT_ID }, select: { id: true } });
  if (!tag || !(await entityInTenant(taggableType, taggableId))) return { error: "Nem található" };

  const existing = await db.tagging.findUnique({
    where: { tagId_taggableType_taggableId: { tagId, taggableType, taggableId } },
    select: { id: true },
  });

  await db.tagging.deleteMany({
    where: { tagId, taggableType, taggableId },
  });

  if (existing) {
    audit("tagging", existing.id, "delete", { tagId, taggableType, taggableId }, null);
  }
  revalidateEntity(taggableType, taggableId);
  return { success: true };
}

export async function getTagsForEntity(type: TaggableType, id: number) {
  const denied = await requireUser();
  if (denied) throw new Error(denied);
  if (!(await entityInTenant(type, id))) return [];
  const taggings = await db.tagging.findMany({
    where: { taggableType: type, taggableId: id, tag: { tenantId: TENANT_ID } },
    include: { tag: true },
    orderBy: { createdAt: "asc" },
  });
  return taggings.map((t) => t.tag);
}

export async function searchByTag(tagName: string) {
  const denied = await requireUser();
  if (denied) throw new Error(denied);
  const tag = await db.tag.findFirst({
    where: { tenantId: TENANT_ID, name: { equals: tagName, mode: "insensitive" } },
    include: { taggings: true },
  });
  if (!tag) return { companies: [], persons: [], tasks: [], deals: [] };

  const ids = (type: TaggableType) =>
    tag.taggings.filter((t) => t.taggableType === type).map((t) => t.taggableId);

  const [companies, persons, tasks] = await Promise.all([
    db.company.findMany({ where: { tenantId: TENANT_ID, id: { in: ids("company") } }, select: { id: true, name: true } }),
    db.person.findMany({  where: { tenantId: TENANT_ID, id: { in: ids("person") } },  select: { id: true, firstName: true, lastName: true } }),
    db.task.findMany({    where: { tenantId: TENANT_ID, id: { in: ids("task") } },    select: { id: true, title: true, status: true } }),
  ]);

  return { companies, persons, tasks, deals: [] };
}
