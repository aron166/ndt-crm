"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { userLeadCtx } from "@/lib/actor";
import { OFFER_TEMPLATES } from "@/lib/offers/offer";
import { acceptLeadOffer, createLeadOffer, sendLeadOffer } from "@/lib/offers/service";
import { createOrderDocument } from "@/lib/documents/service";
import { reportError } from "@/lib/report-error";

// Lead offers (raw60): create (moves to offer_sent, sends nothing), the MANUAL
// send button, and the manual "Ajánlat elfogadva". Every export is gated.

const TENANT_ID = 1;

const createSchema = z.object({
  template: z.enum(OFFER_TEMPLATES),
  areaM2: z.coerce.number().positive().max(1_000_000).optional(),
  bigPackage: z.enum(["standard", "unlimited"]).optional(),
  months: z.coerce.number().int().positive().max(120).optional(),
}).strict();
export type CreateOfferInput = z.input<typeof createSchema>;

function revalidateLead(leadId: number) {
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/tasks");
}

export async function createLeadOfferAction(leadId: number, input: CreateOfferInput) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Érvénytelen adat" };
  const r = await createLeadOffer(leadId, parsed.data, ctx);
  revalidateLead(leadId);
  return r;
}

async function leadOfQuote(quoteId: number): Promise<number | null> {
  const q = await db.quote.findFirst({ where: { id: quoteId, tenantId: TENANT_ID }, select: { leadId: true } });
  return q?.leadId ?? null;
}

export async function sendLeadOfferAction(quoteId: number) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;
  const r = await sendLeadOffer(quoteId, ctx);
  const leadId = await leadOfQuote(quoteId);
  if (leadId) revalidateLead(leadId);
  return r;
}

export async function acceptLeadOfferAction(quoteId: number) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;
  const r = await acceptLeadOffer(quoteId, ctx);
  // Acceptance makes an order (raw60 D13): the Megrendelő is stored on the lead.
  // A failure here never undoes the acceptance; the button can be pressed again (idempotent).
  let orderError: string | null = null;
  if ("success" in r) {
    try {
      const doc = await createOrderDocument(quoteId, ctx);
      if ("error" in doc) orderError = doc.error;
    } catch (err) {
      // The acceptance is committed; an exception here must not look like a failed acceptance (Vanda #B2).
      reportError("offers.accept.orderDocument", err, { quoteId });
      orderError = "váratlan hiba, nyomd meg újra az elfogadást";
    }
  }
  const leadId = await leadOfQuote(quoteId);
  if (leadId) revalidateLead(leadId);
  return orderError ? { success: true as const, warning: `Elfogadva, de a megrendelő nem készült el: ${orderError}` } : r;
}
