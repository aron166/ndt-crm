"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";

const TENANT_ID = 1;

// Every export is a server action, callable by id regardless of the layout
// redirect: refuse non-CRM users before any DB access. Returns the message and
// each action builds its own literal, so TypeScript's union normalisation of
// object-literal returns keeps working (see tasks.ts).
async function requireUser(): Promise<string | null> {
  const { userId } = await getActor(TENANT_ID);
  return userId == null ? NOT_A_CRM_USER : null;
}

export async function upsertCustomField(formData: FormData) {
  const denied = await requireUser();
  if (denied) return { error: denied };
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
    const before = await db.pipelineCustomField.findFirst({
      where: { id, pipeline: { tenantId: TENANT_ID } },
      select: { label: true, type: true, required: true, position: true },
    });
    if (!before) return { error: "Mező nem található" };
    await db.pipelineCustomField.update({
      where: { id },
      data: {
        label, type, required, position,
        options: options ? (options as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
    audit("custom_field", id, "update", before, { label, type, required, position });
  } else {
    const pipeline = await db.pipeline.findFirst({
      where: { id: pipelineId, tenantId: TENANT_ID },
      select: { id: true },
    });
    if (!pipeline) return { error: "Pipeline nem található" };
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
  const denied = await requireUser();
  if (denied) throw new Error(denied);
  const before = await db.pipelineCustomField.findFirst({
    where: { id: fieldId, pipeline: { tenantId: TENANT_ID } },
    select: { pipelineId: true, key: true, label: true, type: true },
  });
  if (!before) return;

  await db.pipelineCustomField.delete({ where: { id: fieldId } });

  audit("custom_field", fieldId, "delete", before, null);
  revalidatePath("/deals/setup");
  revalidatePath("/deals");
}
