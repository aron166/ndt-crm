"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";

export async function upsertCustomField(formData: FormData) {
  const pipelineId = parseInt(formData.get("pipelineId") as string);
  const fieldId    = formData.get("fieldId") as string | null;
  const label      = (formData.get("label") as string)?.trim();
  const type       = (formData.get("type") as string) ?? "text";
  const required   = formData.get("required") === "true";
  const position   = parseInt(formData.get("position") as string) || 0;
  const optionsRaw = (formData.get("options") as string)?.trim();

  if (!label) return { error: "Mező neve kötelező" };

  // derive a stable key from label (slug-like)
  const key = fieldId
    ? (formData.get("key") as string)
    : label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 40);

  const options: string[] | null = optionsRaw
    ? optionsRaw.split("\n").map((s) => s.trim()).filter(Boolean)
    : null;

  if (fieldId) {
    const id = parseInt(fieldId);
    const before = await db.pipelineCustomField.findUnique({
      where: { id },
      select: { label: true, type: true, required: true, position: true },
    });
    await db.pipelineCustomField.update({
      where: { id },
      data: {
        label, type, required, position,
        options: options ? (options as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
    audit("custom_field", id, "update", before, { label, type, required, position });
  } else {
    const field = await db.pipelineCustomField.create({
      data: {
        pipelineId, key, label, type, required, position,
        options: options ? (options as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
    audit("custom_field", field.id, "create", null, { pipelineId, key, label, type, required });
  }

  revalidatePath("/deals/setup");
  revalidatePath("/deals");
  return { success: true };
}

export async function deleteCustomField(fieldId: number) {
  const before = await db.pipelineCustomField.findUnique({
    where: { id: fieldId },
    select: { pipelineId: true, key: true, label: true, type: true },
  });

  await db.pipelineCustomField.delete({ where: { id: fieldId } });

  if (before) audit("custom_field", fieldId, "delete", before, null);
  revalidatePath("/deals/setup");
  revalidatePath("/deals");
}
