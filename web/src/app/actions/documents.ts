"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { userLeadCtx } from "@/lib/actor";
import { signOffLead } from "@/lib/documents/service";
import { SIGNATURE_MAX_BYTES, SIGNOFF_TEXT_MAX } from "@/lib/documents/document";

// On-site sign-off (teljesítésigazolás). Gated like every action: a signed-in CRM user.

const TENANT_ID = 1;

const signOffSchema = z.object({
  signerName: z.string().trim().min(2).max(200),
  signature: z.string().max(SIGNATURE_MAX_BYTES),
  doneScope: z.string().trim().min(3).max(SIGNOFF_TEXT_MAX),
  scopeChange: z.object({
    text: z.string().trim().min(3).max(SIGNOFF_TEXT_MAX),
    newNetHuf: z.coerce.number().min(0).max(1_000_000_000),
  }).nullable().optional(),
}).strict();
export type SignOffActionInput = z.input<typeof signOffSchema>;

export async function signOffLeadAction(leadId: number, input: SignOffActionInput) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;
  const parsed = signOffSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Érvénytelen adat" };
  const r = await signOffLead(leadId, parsed.data, ctx);
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/tasks");
  return r;
}
