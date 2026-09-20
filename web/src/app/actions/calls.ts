"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { userLeadCtx } from "@/lib/actor";
import { logLeadCallOutcome } from "@/lib/leads/service";
import { audit } from "@/lib/audit";
import { NOTE_PREVIEW_LEN, validateTranscript } from "@/lib/calls/transcript";

const TENANT_ID = 1;

/**
 * Store a dictated call transcript as ONE append-only Interaction. This is a
 * fact, not an outcome: `outcome: "transcribed"` is what makes it visible to
 * the (external) parse queue — no lead state changes here.
 */
export async function queueCallTranscript(leadId: number, transcript: string) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;

  const validated = validateTranscript(transcript);
  if ("error" in validated) return validated;

  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId: TENANT_ID },
    select: { companyId: true, campaign: true, contact: { select: { personId: true } } },
  });
  if (!lead) return { error: "Lead nem található" };

  const interaction = await db.interaction.create({
    data: {
      tenantId: TENANT_ID,
      leadId,
      companyId: lead.companyId,
      personId: lead.contact?.personId ?? null,
      userId: ctx.userId,
      type: "call",
      direction: "outbound",
      outcome: "transcribed",
      notes: validated.text.slice(0, NOTE_PREVIEW_LEN),
      transcript: validated.text,
      occurredAt: new Date(),
      campaign: lead.campaign,
    },
    select: { id: true },
  });
  audit("interaction", interaction.id, "create", null, { leadId, outcome: "transcribed" });

  revalidatePath("/drive");
  revalidatePath(`/leads/${leadId}`);
  return { success: true, interactionId: interaction.id };
}

/**
 * Human correction of a machine-derived (or low-confidence, task-routed)
 * outcome. Logs the corrected outcome through the ONE shared write path
 * (logLeadCallOutcome — same as the UI's "Hívás eredménye"), passing
 * supersedesInteractionId INTO that write so the link back to the interaction
 * it replaces is written with the row, append-only. `leadId` is the lead the
 * caller is actually viewing — required and checked against the original
 * interaction's own leadId so a correction can never land on a sibling lead
 * of the same company/person.
 */
export async function correctCallOutcome(interactionId: number, leadId: number, input: {
  outcome: string; note: string; callbackAt?: string | null; demoWith?: string | null;
  bookingAt?: string | null; bookingKind?: string | null;
  lostReason?: string | null; scriptVariant?: string | null; technologyWord?: string | null;
}) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;

  const original = await db.interaction.findFirst({
    where: { id: interactionId, tenantId: TENANT_ID },
    select: { leadId: true },
  });
  if (!original) return { error: "Interakció nem található" };
  if (!original.leadId) return { error: "Az interakcióhoz nincs lead társítva" };
  if (original.leadId !== leadId) return { error: "Az interakció más leadhez tartozik" };

  const res = await logLeadCallOutcome(
    leadId,
    {
      outcome: input.outcome,
      note: input.note,
      supersedesInteractionId: interactionId,
      ...(input.callbackAt ? { callbackAt: input.callbackAt } : {}),
      ...(input.demoWith ? { demoWith: input.demoWith } : {}),
      ...(input.bookingAt ? { bookingAt: input.bookingAt } : {}),
      ...(input.bookingKind ? { bookingKind: input.bookingKind } : {}),
      ...(input.lostReason ? { lostReason: input.lostReason } : {}),
      ...(input.scriptVariant ? { scriptVariant: input.scriptVariant } : {}),
      ...(input.technologyWord ? { technologyWord: input.technologyWord } : {}),
    },
    ctx,
  );
  if ("error" in res) return { error: res.error };

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/tasks");
  return res;
}
