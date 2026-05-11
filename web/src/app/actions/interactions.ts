"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { validateInteractionInput } from "@/lib/interactions";

export async function logInteraction(formData: FormData) {
  const type = formData.get("type") as string;
  const direction = (formData.get("direction") as string) || "outbound";
  const notes = formData.get("notes") as string;
  const outcome = (formData.get("outcome") as string) || "";
  const occurredAt = formData.get("occurredAt") as string;
  const companyIdStr = formData.get("companyId") as string | null;
  const personIdStr = formData.get("personId") as string | null;

  const error = validateInteractionInput({ type, notes, occurredAt });
  if (error) return { error };

  const companyId = companyIdStr ? parseInt(companyIdStr, 10) : null;
  const personId = personIdStr ? parseInt(personIdStr, 10) : null;

  await db.interaction.create({
    data: {
      tenantId: 1,
      type,
      direction,
      notes: notes.trim(),
      outcome: outcome.trim() || null,
      occurredAt: new Date(occurredAt),
      companyId,
      personId,
    },
  });

  if (companyId) {
    await db.company.updateMany({
      where: { id: companyId, tenantId: 1 },
      data: { lastInteractionDate: new Date(occurredAt), updatedAt: new Date() },
    });
    revalidatePath(`/companies/${companyId}`);
  }
  if (personId) revalidatePath(`/persons/${personId}`);

  return { success: true };
}
