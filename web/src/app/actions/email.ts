"use server";

import { revalidatePath } from "next/cache";
import { TENANT_ID } from "@/lib/tenant";
import { sendEmail, sendTestEmail } from "@/lib/integrations/resend";
import { requireCrmUser } from "@/lib/actor";
import { foreignIdError } from "@/lib/tenant-refs";

export async function sendResendTest() {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) return { error: denied };

  try {
    const result = await sendTestEmail(TENANT_ID);
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
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) return { error: denied };

  if (!input.to?.trim()) return { error: "Hiányzó címzett." };
  if (!input.subject?.trim()) return { error: "Hiányzó tárgy." };
  if (!input.text?.trim()) return { error: "Az üzenet nem lehet üres." };
  // sendEmail writes these ids onto the interaction, so they must be ours.
  const refErr = await foreignIdError(TENANT_ID, { companyId: input.companyId, personId: input.personId });
  if (refErr) return { error: refErr };

  let result;
  try {
    result = await sendEmail({
      tenantId: TENANT_ID,
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
