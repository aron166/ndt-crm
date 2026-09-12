import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { computeClosenessScore } from "./closeness";

/**
 * Recompute `closeness_score` for a company and/or a person after something
 * that changes the relationship happened (an interaction, later an invoice).
 *
 * Never throws: the write that triggered it has already succeeded and must not
 * be rolled back because a derived number could not be refreshed.
 *
 * ponytail: recomputed inline, reading all interactions of the entity. A few
 * hundred rows per company today. If a company ever grows tens of thousands of
 * interactions, cap the read to the last ~2 years — older rows score 0.15 and
 * the cap at 55 points makes the tail irrelevant anyway.
 */
export async function recomputeCloseness(target: {
  tenantId: number;
  companyId?: number | null;
  personId?: number | null;
}): Promise<void> {
  const { tenantId, companyId, personId } = target;
  try {
    if (companyId) {
      const [interactions, invoices] = await Promise.all([
        db.interaction.findMany({
          where: { tenantId, companyId },
          select: { type: true, occurredAt: true },
        }),
        db.invoice.findMany({
          // Score thresholds are HUF; a non-HUF invoice is skipped rather than
          // mis-converted — FX conversion is out of scope here.
          where: { tenantId, companyId, currency: "HUF" },
          select: { netAmount: true },
        }),
      ]);
      const score = computeClosenessScore({
        interactions,
        invoices: invoices.map((i) => ({
          netAmount: i.netAmount === null ? null : Number(i.netAmount),
        })),
      });
      await db.company.updateMany({
        where: { id: companyId, tenantId },
        data: { closenessScore: score },
      });
    }

    if (personId) {
      // A person carries no invoices of their own — the money sits on the company.
      const interactions = await db.interaction.findMany({
        where: { tenantId, personId },
        select: { type: true, occurredAt: true },
      });
      const score = computeClosenessScore({ interactions, invoices: [] });
      await db.person.updateMany({
        where: { id: personId, tenantId },
        data: { closenessScore: score },
      });
    }
  } catch (err) {
    reportError("recomputeCloseness", err, { tenantId, companyId, personId });
  }
}
