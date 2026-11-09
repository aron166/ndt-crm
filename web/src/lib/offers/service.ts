import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/report-error";
import { nextQuoteNumber } from "@/lib/quotes/number";
import { sendEmail } from "@/lib/integrations/resend";
import { changeLeadStatus, type LeadCtx } from "@/lib/leads/service";
import {
  buildOffer, offerConfigFromSettings, offerTotals, OFFER_TYPE_BY_TEMPLATE, OFFER_TEMPLATE_LABEL, ACCEPTANCE_TEXT,
  type OfferInput, type OfferMeta, type OfferPdfDoc, type OfferLine,
} from "./offer";
import { renderOfferPdf } from "./pdf";

// Offers from a lead (raw60 D12/D13/D18). Creating an offer moves the lead to
// offer_sent through the W2 transition table but SENDS NOTHING: the email to the
// lead is a separate, manual button (sendLeadOffer). Acceptance is logged by hand
// ("Ajánlat elfogadva") and moves the lead to ordered.

type Result<T = object> = ({ success: true } & T) | { error: string };
const DAY = 86_400_000;

/** Which event qualifies the lead from its current stage (W2 table). */
const QUALIFY_EVENT: Record<string, string> = {
  new: "call_qualified", contacting: "call_qualified", discovery_booked: "meeting_done_fit",
};

function leadEmail(lead: { customFields: unknown; contact: { email: string | null; person: { email: string | null } | null } | null }): string | null {
  const cf = (lead.customFields ?? {}) as Record<string, unknown>;
  return lead.contact?.email || lead.contact?.person?.email || (typeof cf.contact_email === "string" ? cf.contact_email : null) || null;
}

/**
 * Create the offer document for a lead and move the lead to offer_sent
 * (via qualified when needed). The Quote is created first and removed again if
 * the move is refused, so a lead never has an offer it was not moved for.
 */
export async function createLeadOffer(leadId: number, input: OfferInput, ctx: LeadCtx): Promise<Result<{ quoteId: number; hasPlaceholders: boolean }>> {
  const { tenantId } = ctx;
  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId },
    select: { id: true, status: true, outcome: true, companyId: true, offerType: true, contact: { select: { personId: true } }, company: { select: { name: true } } },
  });
  if (!lead) return { error: "Lead nem található" };
  if (lead.outcome !== "open") return { error: "Lezárt leadhez nem készül ajánlat" };
  if (!lead.companyId) return { error: "A leadhez nincs cég társítva" };
  const status = lead.status ?? "new";
  if (status !== "qualified" && status !== "offer_sent" && !QUALIFY_EVENT[status]) {
    return { error: "Ebből a fázisból nem küldhető ajánlat" };
  }

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const built = buildOffer(input, offerConfigFromSettings(tenant?.settings));
  if ("error" in built) return built;
  const totals = offerTotals(built.lines, built.vatRate);
  const now = new Date();
  const year = now.getFullYear();

  let quoteId: number;
  try {
    quoteId = await db.$transaction(async (tx) => {
      const existing = await tx.quote.findMany({ where: { tenantId, quoteNumber: { startsWith: `AJ-${year}-` } }, select: { quoteNumber: true } });
      const q = await tx.quote.create({
        data: {
          tenantId, companyId: lead.companyId!, personId: lead.contact?.personId ?? null, leadId,
          quoteNumber: nextQuoteNumber(existing.map((e) => e.quoteNumber), year),
          title: built.title, status: "draft", vatRate: built.vatRate,
          netAmount: totals.net, vatAmount: totals.vat, grossAmount: totals.gross,
          validUntil: new Date(now.getTime() + built.meta.validityDays * DAY),
          template: input.template, meta: built.meta as unknown as Prisma.InputJsonValue,
          items: {
            create: built.lines.map((l, i) => ({
              tenantId, position: i, description: l.description, quantity: l.quantity, unit: l.unit,
              unitRate: l.unitRate, amount: l.amount,
            })),
          },
        },
        select: { id: true },
      });
      return q.id;
    });
  } catch (err) {
    reportError("offers.create", err, { leadId });
    return { error: "Az ajánlat létrehozása nem sikerült" };
  }

  // Lifecycle: qualify (offer_type from the template) when needed, then offer_sent.
  const offerType = OFFER_TYPE_BY_TEMPLATE[input.template];
  const steps: [string, string][] = [];
  if (QUALIFY_EVENT[status]) steps.push(["qualified", QUALIFY_EVENT[status]]);
  if (status !== "offer_sent") steps.push(["offer_sent", "offer_sent"]);
  for (const [to, event] of steps) {
    const r = await changeLeadStatus(leadId, to, ctx, { event, offerType });
    if ("error" in r) {
      if (to === "qualified" || steps.length === 1) {
        // Nothing moved yet: the draft offer goes too.
        await db.quote.deleteMany({ where: { id: quoteId, tenantId, status: "draft" } });
        return { error: r.error };
      }
      // Qualified but not moved on: the offer stays, the lead is in qualified. Say so.
      return { error: `Az ajánlat elkészült, de a lead a Minősítve fázisban maradt: ${r.error}` };
    }
  }
  audit("quote", quoteId, "create", null, { leadId, template: input.template, hasPlaceholders: built.hasPlaceholders },
    { tenantId, actor: ctx.actor, actorAgentId: ctx.actorAgentId });
  return { success: true, quoteId, hasPlaceholders: built.hasPlaceholders };
}

/** The frozen document for the PDF; null when not this tenant's offer. */
export async function loadOfferPdfDoc(quoteId: number, tenantId: number): Promise<OfferPdfDoc | null> {
  const q = await db.quote.findFirst({
    where: { id: quoteId, tenantId, template: { not: null } },
    include: {
      items: { orderBy: { position: "asc" } },
      company: { select: { name: true } },
      person: { select: { firstName: true, lastName: true, email: true, phone: true } },
    },
  });
  if (!q || !q.meta) return null;
  const lines: OfferLine[] = q.items.map((i) => ({
    description: i.description,
    quantity: i.quantity != null ? Number(i.quantity) : null,
    unit: i.unit,
    unitRate: i.unitRate != null ? Number(i.unitRate) : null,
    amount: i.unitRate != null && i.amount != null ? Number(i.amount) : null,
  }));
  const vatRate = Number(q.vatRate);
  const p = q.person;
  return {
    quoteNumber: q.quoteNumber, title: q.title, createdAt: q.createdAt, validUntil: q.validUntil,
    currency: q.currency, vatRate, totals: offerTotals(lines, vatRate),
    customer: {
      company: q.company?.name ?? null,
      contactName: p ? `${p.lastName} ${p.firstName}`.trim() : null,
      email: p?.email ?? null, phone: p?.phone ?? null,
    },
    lines, meta: q.meta as unknown as OfferMeta,
  };
}

/** True when the document still carries a placeholder (price or issuer legal facts). */
export function offerDocHasPlaceholders(doc: OfferPdfDoc): boolean {
  return !doc.totals.complete || !doc.meta.issuer.address || !doc.meta.issuer.taxNumber;
}

/**
 * The MANUAL send (Péter / Áron press it). Refuses an offer with placeholders,
 * an offer of another tenant, or a lead without an email. Marks the quote sent.
 */
export async function sendLeadOffer(quoteId: number, ctx: LeadCtx): Promise<Result<{ to: string }>> {
  const { tenantId } = ctx;
  const q = await db.quote.findFirst({
    where: { id: quoteId, tenantId, template: { not: null }, leadId: { not: null } },
    select: {
      id: true, status: true, leadId: true, companyId: true, personId: true,
      lead: { select: { customFields: true, contact: { select: { email: true, person: { select: { email: true } } } } } },
    },
  });
  if (!q || !q.lead) return { error: "Ajánlat nem található" };
  if (q.status !== "draft" && q.status !== "sent") return { error: "Ez az ajánlat már nem küldhető" };
  const to = leadEmail(q.lead);
  if (!to) return { error: "A leadnek nincs e-mail címe" };
  const doc = await loadOfferPdfDoc(quoteId, tenantId);
  if (!doc) return { error: "Ajánlat nem található" };
  if (offerDocHasPlaceholders(doc)) return { error: "Az ajánlatban még van egyeztetés alatti adat (ár vagy cégadat): így nem küldhető ki" };

  const pdf = await renderOfferPdf(doc);
  const brand = doc.meta.issuer.brand ?? doc.meta.issuer.legalName ?? "";
  const sent = await sendEmail({
    tenantId, to,
    subject: `Ajánlat ${doc.quoteNumber}: ${OFFER_TEMPLATE_LABEL[doc.meta.template]} (${brand})`,
    text: [
      "Tisztelt Ügyfelünk!",
      "",
      `Mellékelten küldjük ${doc.quoteNumber} számú ajánlatunkat.`,
      "",
      ACCEPTANCE_TEXT,
      "",
      "Üdvözlettel:",
      brand,
    ].join("\n"),
    companyId: q.companyId, personId: q.personId,
    attachments: [{ filename: `${doc.quoteNumber}.pdf`, content: Buffer.from(pdf).toString("base64") }],
  });
  if (!sent.ok) return { error: sent.error };
  await db.quote.updateMany({ where: { id: quoteId, tenantId }, data: { status: "sent", sentAt: new Date() } });
  audit("quote", quoteId, "update", { status: q.status }, { status: "sent", to }, { tenantId, actor: ctx.actor, actorAgentId: ctx.actorAgentId });
  return { success: true, to };
}

/**
 * "Ajánlat elfogadva": the lead replied "Elfogadom" (logged by hand). Marks the
 * quote accepted and moves the lead to ordered (offer_accepted, or order_placed
 * after a demo), which creates the booking call task. No invoice (raw60 D13).
 */
export async function acceptLeadOffer(quoteId: number, ctx: LeadCtx): Promise<Result> {
  const { tenantId } = ctx;
  const q = await db.quote.findFirst({
    where: { id: quoteId, tenantId, template: { not: null }, leadId: { not: null } },
    select: { id: true, status: true, leadId: true, lead: { select: { status: true } } },
  });
  if (!q || !q.leadId || !q.lead) return { error: "Ajánlat nem található" };
  if (q.status === "accepted") return { success: true };
  if (q.status !== "sent" && q.status !== "draft") return { error: "Ez az ajánlat már nem fogadható el" };
  const event = q.lead.status === "demo_done" ? "order_placed" : "offer_accepted";
  const r = await changeLeadStatus(q.leadId, "ordered", ctx, { event });
  if ("error" in r) return r;
  await db.quote.updateMany({ where: { id: quoteId, tenantId }, data: { status: "accepted", acceptedAt: new Date() } });
  audit("quote", quoteId, "update", { status: q.status }, { status: "accepted" }, { tenantId, actor: ctx.actor, actorAgentId: ctx.actorAgentId });
  return { success: true };
}
