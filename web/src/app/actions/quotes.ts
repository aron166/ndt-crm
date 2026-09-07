"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { quoteTotals, lineAmount } from "@/lib/quotes/calc";
import { nextQuoteNumber } from "@/lib/quotes/number";
import { QUOTE_STATUSES, type QuoteStatus } from "@/lib/quotes/status";

const TENANT_ID = 1;

// NOTE: QuoteStatus / QUOTE_STATUSES live in lib/quotes/status (pure module) — a
// "use server" file may only export async functions, and Next's action transform
// rejects even a type re-export here. Import QuoteStatus straight from status.

export interface QuoteLineDTO {
  costCode: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  unitRate: number | null;
  amount: number;
}

export interface QuoteDTO {
  id: number;
  companyId: number;
  companyName: string;
  personId: number | null;
  personName: string | null;
  leadId: number | null;
  dealId: number | null;
  quoteNumber: string;
  title: string;
  status: QuoteStatus;
  currency: string;
  vatRate: number;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  validUntil: Date | null;
  notes: string | null;
  sentAt: Date | null;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: QuoteLineDTO[];
}

export interface QuoteListItem {
  id: number;
  quoteNumber: string;
  title: string;
  status: QuoteStatus;
  companyId: number;
  companyName: string;
  grossAmount: number;
  currency: string;
  validUntil: Date | null;
  createdAt: Date;
}

export interface QuoteInput {
  companyId: number;
  personId?: number | null;
  leadId?: number | null;
  dealId?: number | null;
  title: string;
  vatRate: number;
  validUntil?: string | null; // ISO date (yyyy-mm-dd) or null
  notes?: string | null;
  lines: Array<{
    costCode: string | null;
    description: string;
    quantity: number | null;
    unit: string | null;
    unitRate: number | null;
  }>;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

function personName(p: { firstName: string; lastName: string } | null): string | null {
  if (!p) return null;
  return `${p.lastName} ${p.firstName}`.trim();
}

// Drop empty rows (no description AND no amount) so a half-filled draft line
// doesn't persist as junk. Each kept line gets its computed amount.
function prepareLines(lines: QuoteInput["lines"]) {
  return lines
    .filter((l) => (l.description?.trim() ?? "") !== "" || lineAmount(l) > 0)
    .map((l, i) => ({
      position: i,
      costCode: l.costCode?.trim() || null,
      description: l.description?.trim() ?? "",
      quantity: l.quantity ?? null,
      unit: l.unit?.trim() || null,
      unitRate: l.unitRate ?? null,
      amount: lineAmount(l),
    }));
}

function validateInput(input: QuoteInput): string | null {
  if (!input.companyId) return "Cég kötelező";
  if (!input.title?.trim()) return "Cím kötelező";
  if (!Number.isFinite(input.vatRate) || input.vatRate < 0) return "Érvénytelen ÁFA-kulcs";
  return null;
}

const quoteInclude = {
  company: { select: { name: true } },
  person: { select: { firstName: true, lastName: true } },
  items: { orderBy: { position: "asc" } },
} as const;

function toDTO(q: {
  id: number; companyId: number; company: { name: string };
  personId: number | null; person: { firstName: string; lastName: string } | null;
  leadId: number | null; dealId: number | null; quoteNumber: string; title: string;
  status: string; currency: string; vatRate: unknown; netAmount: unknown;
  vatAmount: unknown; grossAmount: unknown; validUntil: Date | null; notes: string | null;
  sentAt: Date | null; acceptedAt: Date | null; createdAt: Date; updatedAt: Date;
  items: Array<{ costCode: string | null; description: string; quantity: unknown; unit: string | null; unitRate: unknown; amount: unknown }>;
}): QuoteDTO {
  return {
    id: q.id,
    companyId: q.companyId,
    companyName: q.company.name,
    personId: q.personId,
    personName: personName(q.person),
    leadId: q.leadId,
    dealId: q.dealId,
    quoteNumber: q.quoteNumber,
    title: q.title,
    status: q.status as QuoteStatus,
    currency: q.currency,
    vatRate: num(q.vatRate),
    netAmount: num(q.netAmount),
    vatAmount: num(q.vatAmount),
    grossAmount: num(q.grossAmount),
    validUntil: q.validUntil,
    notes: q.notes,
    sentAt: q.sentAt,
    acceptedAt: q.acceptedAt,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    items: q.items.map((i) => ({
      costCode: i.costCode,
      description: i.description,
      quantity: i.quantity != null ? num(i.quantity) : null,
      unit: i.unit,
      unitRate: i.unitRate != null ? num(i.unitRate) : null,
      amount: num(i.amount),
    })),
  };
}

export async function getQuotes(): Promise<QuoteListItem[]> {
  const rows = await db.quote.findMany({
    where: { tenantId: TENANT_ID },
    include: { company: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((q) => ({
    id: q.id,
    quoteNumber: q.quoteNumber,
    title: q.title,
    status: q.status as QuoteStatus,
    companyId: q.companyId,
    companyName: q.company.name,
    grossAmount: num(q.grossAmount),
    currency: q.currency,
    validUntil: q.validUntil,
    createdAt: q.createdAt,
  }));
}

export async function getQuote(id: number): Promise<QuoteDTO | null> {
  const q = await db.quote.findFirst({
    where: { id, tenantId: TENANT_ID },
    include: quoteInclude,
  });
  return q ? toDTO(q) : null;
}

export async function createQuote(
  input: QuoteInput,
): Promise<{ id: number } | { error: string }> {
  const err = validateInput(input);
  if (err) return { error: err };

  const company = await db.company.findFirst({
    where: { id: input.companyId, tenantId: TENANT_ID },
    select: { id: true },
  });
  if (!company) return { error: "Cég nem található" };

  const year = new Date().getFullYear();
  const lines = prepareLines(input.lines);
  const totals = quoteTotals(lines, input.vatRate);

  // Number is computed as max-for-year + 1, guarded by a unique (tenant, number)
  // index. Two concurrent creates can derive the same number → the loser hits a
  // P2002; recompute and retry rather than surfacing a generic failure.
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.quote.findMany({
      where: { tenantId: TENANT_ID, quoteNumber: { startsWith: `AJ-${year}-` } },
      select: { quoteNumber: true },
    });
    const quoteNumber = nextQuoteNumber(existing.map((e) => e.quoteNumber), year);

    try {
      const created = await db.quote.create({
        data: {
          tenantId: TENANT_ID,
          companyId: input.companyId,
          personId: input.personId ?? null,
          leadId: input.leadId ?? null,
          dealId: input.dealId ?? null,
          quoteNumber,
          title: input.title.trim(),
          status: "draft",
          vatRate: input.vatRate,
          netAmount: totals.net,
          vatAmount: totals.vat,
          grossAmount: totals.gross,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
          notes: input.notes?.trim() || null,
          items: { create: lines.map((l) => ({ ...l, tenantId: TENANT_ID })) },
        },
      });

      audit("quote", created.id, "create", null, { quoteNumber, title: created.title, grossAmount: totals.gross }, { tenantId: TENANT_ID });
      revalidatePath("/quotes");
      return { id: created.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { error: "Az árajánlat sorszámának előállítása nem sikerült, próbáld újra" };
}

export async function updateQuote(
  id: number,
  input: QuoteInput,
): Promise<{ success: true } | { error: string }> {
  const err = validateInput(input);
  if (err) return { error: err };

  const existing = await db.quote.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { id: true, grossAmount: true },
  });
  if (!existing) return { error: "Árajánlat nem található" };

  const lines = prepareLines(input.lines);
  const totals = quoteTotals(lines, input.vatRate);

  // Replace line items wholesale inside a transaction — the items relation is the
  // source of truth and the totals are recomputed from it.
  await db.$transaction([
    db.quoteLineItem.deleteMany({ where: { quoteId: id } }),
    db.quote.update({
      where: { id },
      data: {
        personId: input.personId ?? null,
        leadId: input.leadId ?? null,
        dealId: input.dealId ?? null,
        title: input.title.trim(),
        vatRate: input.vatRate,
        netAmount: totals.net,
        vatAmount: totals.vat,
        grossAmount: totals.gross,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        notes: input.notes?.trim() || null,
        items: { create: lines.map((l) => ({ ...l, tenantId: TENANT_ID })) },
      },
    }),
  ]);

  audit("quote", id, "update", { grossAmount: num(existing.grossAmount) }, { grossAmount: totals.gross }, { tenantId: TENANT_ID });
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  return { success: true };
}

export async function setQuoteStatus(
  id: number,
  status: QuoteStatus,
): Promise<{ success: true } | { error: string }> {
  if (!QUOTE_STATUSES.includes(status)) return { error: "Ismeretlen állapot" };

  const existing = await db.quote.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { status: true, sentAt: true, acceptedAt: true },
  });
  if (!existing) return { error: "Árajánlat nem található" };

  const now = new Date();
  await db.quote.update({
    where: { id },
    data: {
      status,
      // Stamp the milestone the first time it happens; keep the original date on re-entry.
      sentAt: status === "sent" && !existing.sentAt ? now : undefined,
      acceptedAt: status === "accepted" && !existing.acceptedAt ? now : undefined,
    },
  });

  audit("quote", id, "update", { status: existing.status }, { status }, { tenantId: TENANT_ID });
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  return { success: true };
}

/** Lightweight company typeahead for the "new quote" picker (name match, capped). */
export async function searchCompaniesForQuote(
  query: string,
): Promise<Array<{ id: number; name: string; city: string | null }>> {
  const q = query.trim();
  if (q.length < 1) return [];
  return db.company.findMany({
    where: { tenantId: TENANT_ID, deletedAt: null, name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, city: true },
    orderBy: { name: "asc" },
    take: 8,
  });
}

export async function deleteQuote(id: number): Promise<{ success: true } | { error: string }> {
  const existing = await db.quote.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { quoteNumber: true },
  });
  if (!existing) return { error: "Árajánlat nem található" };

  // Line items cascade on the FK.
  await db.quote.delete({ where: { id } });
  audit("quote", id, "delete", { quoteNumber: existing.quoteNumber }, null, { tenantId: TENANT_ID });
  revalidatePath("/quotes");
  return { success: true };
}
