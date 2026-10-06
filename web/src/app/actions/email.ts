"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { DEFAULT_TENANT_ID, sendEmail, sendTestEmail } from "@/lib/integrations/resend";
import { requireCrmUser } from "@/lib/actor";

export async function sendResendTest() {
  const denied = await requireCrmUser(DEFAULT_TENANT_ID);
  if (denied) return { error: denied };

  try {
    const result = await sendTestEmail(DEFAULT_TENANT_ID);
    if (!result.ok) return { error: result.error };
    return { success: true };
  } catch {
    return { error: "Nem sikerült elküldeni a teszt emailt." };
  }
}

export async function sendCrmEmail(input: {
  to: string;
  subject: string;
  text: string;
  companyId?: number | null;
  personId?: number | null;
}) {
  const denied = await requireCrmUser(DEFAULT_TENANT_ID);
  if (denied) return { error: denied };

  if (!input.to?.trim()) return { error: "Hiányzó címzett." };
  if (!input.subject?.trim()) return { error: "Hiányzó tárgy." };
  if (!input.text?.trim()) return { error: "Az üzenet nem lehet üres." };
  // sendEmail writes these ids onto the interaction, so they must be ours.
  if (input.companyId != null && !(await db.company.findFirst({ where: { id: input.companyId, tenantId: DEFAULT_TENANT_ID }, select: { id: true } }))) {
    return { error: "Cég nem található" };
  }
  if (input.personId != null && !(await db.person.findFirst({ where: { id: input.personId, tenantId: DEFAULT_TENANT_ID }, select: { id: true } }))) {
    return { error: "Személy nem található" };
  }

  let result;
  try {
    result = await sendEmail({
      tenantId: DEFAULT_TENANT_ID,
      to: input.to,
      subject: input.subject,
      text: input.text,
      companyId: input.companyId ?? null,
      personId: input.personId ?? null,
    });
  } catch {
    return { error: "Nem sikerült elküldeni az emailt." };
  }

  if (!result.ok) return { error: result.error };

  if (input.companyId) revalidatePath(`/companies/${input.companyId}`);
  if (input.personId) revalidatePath(`/persons/${input.personId}`);
  return { success: true };
}
