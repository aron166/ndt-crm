"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

const TENANT_ID = 1;

export type TaggableType = "company" | "person" | "deal" | "task" | "interaction";

function revalidateEntity(type: TaggableType, id: number) {
  if (type === "company")  revalidatePath(`/companies/${id}`);
  if (type === "person")   revalidatePath(`/persons/${id}`);
  if (type === "task")     revalidatePath(`/tasks/${id}`);
}

export async function addTag(
  taggableType: TaggableType,
  taggableId: number,
  name: string,
  color?: string
) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Üres tag" };

  const tag = await db.tag.upsert({
    where: { tenantId_name: { tenantId: TENANT_ID, name: trimmed } },
    update: {},
    create: { tenantId: TENANT_ID, name: trimmed, color: color ?? "#6366f1" },
  });

  await db.tagging.upsert({
    where: { tagId_taggableType_taggableId: { tagId: tag.id, taggableType, taggableId } },
    update: {},
    create: { tagId: tag.id, taggableType, taggableId },
  });

  revalidateEntity(taggableType, taggableId);
  return { success: true, tag };
}

export async function removeTag(
  taggableType: TaggableType,
  taggableId: number,
  tagId: number
) {
  await db.tagging.deleteMany({
    where: { tagId, taggableType, taggableId },
  });
  revalidateEntity(taggableType, taggableId);
}

export async function getTagsForEntity(type: TaggableType, id: number) {
  const taggings = await db.tagging.findMany({
    where: { taggableType: type, taggableId: id },
    include: { tag: true },
    orderBy: { createdAt: "asc" },
  });
  return taggings.map((t) => t.tag);
}

export async function searchByTag(tagName: string) {
  const tag = await db.tag.findFirst({
    where: { tenantId: TENANT_ID, name: { equals: tagName, mode: "insensitive" } },
    include: { taggings: true },
  });
  if (!tag) return { companies: [], persons: [], tasks: [], deals: [] };

  const ids = (type: TaggableType) =>
    tag.taggings.filter((t) => t.taggableType === type).map((t) => t.taggableId);

  const [companies, persons, tasks] = await Promise.all([
    db.company.findMany({ where: { id: { in: ids("company") } }, select: { id: true, name: true } }),
    db.person.findMany({  where: { id: { in: ids("person") } },  select: { id: true, firstName: true, lastName: true } }),
    db.task.findMany({    where: { id: { in: ids("task") } },    select: { id: true, title: true, status: true } }),
  ]);

  return { companies, persons, tasks, deals: [] };
}
