"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_TENANT_ID, sendEmail, sendTestEmail } from "@/lib/integrations/resend";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";

// Same gate as tasks.ts: returns the MESSAGE (not an object) so each action builds
// its own literal and TypeScript keeps normalising the return-type union.
async function requireUser(): Promise<string | null> {
  const { userId } = await getActor(DEFAULT_TENANT_ID);
  return userId == null ? NOT_A_CRM_USER : null;
}

export async function sendResendTest() {
  const denied = await requireUser();
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
  const denied = await requireUser();
  if (denied) return { error: denied };

  if (!input.to?.trim()) return { error: "Hiányzó címzett." };
  if (!input.subject?.trim()) return { error: "Hiányzó tárgy." };
  if (!input.text?.trim()) return { error: "Az üzenet nem lehet üres." };

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
