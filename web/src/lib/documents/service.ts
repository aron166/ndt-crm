import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/report-error";
import { changeLeadStatus, LIFECYCLE_TASK_TAG, type LeadCtx } from "@/lib/leads/service";
import { addWorkdays } from "@/lib/leads/lifecycle";
import { loadOfferPdfDoc } from "@/lib/offers/service";
import { offerConfigFromSettings } from "@/lib/offers/offer";
import {
  buildOrderData, nextDocumentNumber, signOffIssue,
  type CompletionData, type DocumentKind, type DocumentData,
} from "./document";

// Lead documents, DB side. Nothing here sends anything to the lead.
// Invoicing stays manual: the sign-off creates a task to issue the invoice.
// shortcut: no számlázz.hu / Billingo API yet (raw60 D14), add it when invoice volume justifies it.

type Result<T = object> = ({ success: true } & T) | { error: string };

/** Insert a document with the next number of its kind; retries a number collision (double click, two users). */
async function insertDocument(
  args: { tenantId: number; leadId: number; quoteId: number | null; kind: DocumentKind; data: DocumentData; createdById: number | null },
): Promise<{ id: number; number: string }> {
  const year = new Date().getFullYear();
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const existing = await tx.leadDocument.findMany({
          where: { tenantId: args.tenantId, kind: args.kind, number: { startsWith: `${args.kind === "order" ? "MR" : "TI"}-${year}-` } },
          select: { number: true },
        });
        const number = nextDocumentNumber(args.kind, existing.map((e) => e.number), year);
        return tx.leadDocument.create({
          data: {
            tenantId: args.tenantId, leadId: args.leadId, quoteId: args.quoteId, kind: args.kind, number,
            data: args.data as unknown as Prisma.InputJsonValue, createdById: args.createdById,
          },
          select: { id: true, number: true },
        });
      });
    } catch (err) {
      const code = (err as { code?: string; meta?: { target?: unknown } })?.code;
      if (code === "P2002" && attempt < 4) {
        // A Megrendelő already made for this quote is not a collision to retry: the caller handles it.
        if (args.quoteId != null) {
          const prior = await db.leadDocument.findFirst({ where: { quoteId: args.quoteId, kind: args.kind, tenantId: args.tenantId }, select: { id: true, number: true } });
          if (prior) return prior;
        }
        continue;
      }
      throw err;
    }
  }
}

/**
 * The Megrendelő for an accepted offer (raw60 D13: acceptance makes an order,
 * not an invoice). One per quote; calling it again returns the existing one.
 */
export async function createOrderDocument(quoteId: number, ctx: LeadCtx): Promise<Result<{ documentId: number; number: string }>> {
  const { tenantId } = ctx;
  const prior = await db.leadDocument.findFirst({ where: { tenantId, quoteId, kind: "order" }, select: { id: true, number: true } });
  if (prior) return { success: true, documentId: prior.id, number: prior.number };
  const q = await db.quote.findFirst({
    where: { id: quoteId, tenantId, status: "accepted", leadId: { not: null } },
    select: { leadId: true, acceptedAt: true },
  });
  if (!q?.leadId) return { error: "Csak elfogadott ajánlatból készül megrendelő" };
  const offer = await loadOfferPdfDoc(quoteId, tenantId);
  if (!offer) return { error: "Ajánlat nem található" };
  const doc = await insertDocument({
    tenantId, leadId: q.leadId, quoteId, kind: "order",
    data: buildOrderData(offer, q.acceptedAt ?? new Date()), createdById: ctx.userId,
  });
  audit("lead", q.leadId, "update", null, { document: doc.number, kind: "order", quoteId }, { tenantId, actor: ctx.actor, actorAgentId: ctx.actorAgentId });
  return { success: true, documentId: doc.id, number: doc.number };
}

export interface SignOffInput {
  signerName: string;
  /** PNG data URL from the signature canvas. */
  signature: string;
  doneScope: string;
  scopeChange?: { text: string; newNetHuf: number } | null;
}

/**
 * On-site sign-off (raw60 D16): the customer signs on the tablet; we store the
 * teljesítésigazolás with a server timestamp, then log the W2 work_completed
 * move (still `ordered`: done, not paid) with the invoice task. The signed
 * document is never deleted, even if the move fails afterwards: it is the
 * customer's signed record.
 */
export async function signOffLead(leadId: number, input: SignOffInput, ctx: LeadCtx): Promise<Result<{ documentId: number; number: string }>> {
  const { tenantId } = ctx;
  const issue = signOffIssue(input);
  if (issue) return { error: issue };
  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId },
    select: {
      status: true, companyId: true, customFields: true,
      company: { select: { name: true } },
      contact: { select: { email: true, phone: true, personId: true, person: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!lead) return { error: "Lead nem található" };
  if (lead.status !== "ordered") return { error: "Teljesítésigazolás csak megrendelt munkához készül" };

  const [order, tenant] = await Promise.all([
    db.leadDocument.findFirst({ where: { tenantId, leadId, kind: "order" }, orderBy: { createdAt: "desc" }, select: { number: true, data: true, createdAt: true } }),
    db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
  ]);
  // Idempotent (Vanda #B1): a retry, a timeout or a double tap finds the sign-off of
  // this order already signed and only completes what is missing (move, task); it
  // never makes a second signed document.
  const prior = await db.leadDocument.findFirst({
    where: { tenantId, leadId, kind: "completion", ...(order ? { createdAt: { gte: order.createdAt } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true, data: true, createdAt: true },
  });
  if (prior) {
    const scopeChanged = (prior.data as { scopeChange?: unknown } | null)?.scopeChange != null;
    const finished = await finishSignOff(leadId, prior.number, scopeChanged, prior.createdAt, lead.companyId, lead.contact?.personId ?? null, ctx);
    return "error" in finished ? finished : { success: true, documentId: prior.id, number: prior.number };
  }
  const cf = (lead.customFields ?? {}) as Record<string, unknown>;
  const p = lead.contact?.person;
  const now = new Date();
  const data: CompletionData = {
    kind: "completion",
    issuer: offerConfigFromSettings(tenant?.settings).issuer,
    customer: {
      company: lead.company?.name ?? null,
      contactName: (typeof cf.contact_name === "string" && cf.contact_name) || (p ? `${p.lastName} ${p.firstName}`.trim() : null),
      email: lead.contact?.email ?? null,
      phone: lead.contact?.phone ?? null,
    },
    orderNumber: order?.number ?? null,
    signerName: input.signerName.trim(),
    signature: input.signature,
    signedAt: now.toISOString(),
    doneScope: input.doneScope.trim(),
    scopeChange: input.scopeChange ? { text: input.scopeChange.text.trim(), newNetHuf: Math.round(input.scopeChange.newNetHuf) } : null,
  };
  const doc = await insertDocument({ tenantId, leadId, quoteId: null, kind: "completion", data, createdById: ctx.userId });
  audit("lead", leadId, "update", null, { document: doc.number, kind: "completion", scopeChanged: data.scopeChange != null }, { tenantId, actor: ctx.actor, actorAgentId: ctx.actorAgentId });

  const finished = await finishSignOff(leadId, doc.number, data.scopeChange != null, now, lead.companyId, lead.contact?.personId ?? null, ctx);
  return "error" in finished ? finished : { success: true, documentId: doc.id, number: doc.number };
}

/**
 * The parts of a sign-off after the signed document exists: the W2 work_completed
 * move (once per document) and the invoice task (once per document). Safe to call again.
 */
async function finishSignOff(
  leadId: number, number: string, scopeChanged: boolean, signedAt: Date,
  companyId: number | null, personId: number | null, ctx: LeadCtx,
): Promise<Result> {
  const { tenantId } = ctx;
  const due = addWorkdays(new Date(), 1);
  const alreadyMoved = await db.leadStatusHistory.findFirst({
    where: { tenantId, leadId, event: "work_completed", at: { gte: signedAt } }, select: { id: true },
  });
  if (!alreadyMoved) {
    const moved = await changeLeadStatus(leadId, "ordered", ctx, {
      event: "work_completed", nextAction: "Számla kiállítása a teljesítésigazolás alapján", nextDue: due,
    });
    if ("error" in moved) {
      reportError("documents.signOff.move", new Error(moved.error), { leadId, document: number });
      return { error: `A teljesítésigazolás elkészült (${number}), de a lead állapota nem frissült: ${moved.error}` };
    }
  }
  const title = `Számla kiállítása (${number}${scopeChanged ? ", módosított ár" : ""})`;
  try {
    const exists = await db.task.findFirst({ where: { tenantId, leadId, title }, select: { id: true } });
    if (!exists) {
      await db.task.create({
        data: {
          tenantId, leadId, companyId, personId,
          assignedToId: ctx.userId, title,
          type: "internal", category: "revenue_generating", status: "created", dueDate: due,
          setMembership: [LIFECYCLE_TASK_TAG],
        },
      });
    }
  } catch (err) {
    reportError("documents.signOff.task", err, { leadId });
  }
  return { success: true };
}

/** The frozen data of one document of this tenant's lead, for the PDF route. */
export async function loadDocument(leadId: number, documentId: number, tenantId: number) {
  return db.leadDocument.findFirst({
    where: { id: documentId, leadId, tenantId },
    select: { id: true, kind: true, number: true, data: true, createdAt: true },
  });
}
