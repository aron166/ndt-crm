"use server";

import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/integrations/resend";

export async function sendCrmEmail(input: {
  to: string;
  subject: string;
  text: string;
  companyId?: number | null;
  personId?: number | null;
}) {
  if (!input.to?.trim()) return { error: "Hiányzó címzett." };
  if (!input.subject?.trim()) return { error: "Hiányzó tárgy." };
  if (!input.text?.trim()) return { error: "Az üzenet nem lehet üres." };

  const result = await sendEmail({
    to: input.to,
    subject: input.subject,
    text: input.text,
    companyId: input.companyId ?? null,
    personId: input.personId ?? null,
  });

  if (!result.ok) return { error: result.error };

  if (input.companyId) revalidatePath(`/companies/${input.companyId}`);
  if (input.personId) revalidatePath(`/persons/${input.personId}`);
  return { success: true };
}
