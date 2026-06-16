// NDT quote (árajánlat) math. Pure, DB-free. A quote is a list of line items,
// each priced from the cost codes + rate card (decisions.md #15 — measure
// everything, every value dynamic). This file computes line amounts and the
// net / VAT / gross totals that get STORED on the quote at save time, so a sent
// quote stays an immutable figure even if the rate card later changes.
import { computeCostAmount } from "../tasks/costing";

export interface QuoteLineInput {
  costCode?: string | null;
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitRate?: number | null;
}

export interface QuoteTotals {
  /** Sum of every line amount, in HUF. */
  net: number;
  /** ÁFA on the net at `vatRate` %, rounded to whole HUF. */
  vat: number;
  /** net + vat. */
  gross: number;
}

/**
 * Billable amount for a single line = quantity × unit rate, in whole HUF.
 * Reuses the same rounding rule as task costing. A line missing quantity or rate
 * isn't billable yet → 0 (so an in-progress draft still totals cleanly).
 */
export function lineAmount(line: QuoteLineInput): number {
  return computeCostAmount(line.quantity, line.unitRate) ?? 0;
}

/** Net total across all lines (sum of line amounts), in whole HUF. */
export function netTotal(lines: ReadonlyArray<QuoteLineInput>): number {
  return lines.reduce((sum, l) => sum + lineAmount(l), 0);
}

/**
 * Net / VAT / gross for a quote. `vatRate` is a percentage (Hungarian default 27).
 * VAT and gross are rounded to whole HUF (no fillér in practice).
 */
export function quoteTotals(
  lines: ReadonlyArray<QuoteLineInput>,
  vatRate: number,
): QuoteTotals {
  const net = netTotal(lines);
  const rate = Number.isFinite(vatRate) && vatRate > 0 ? vatRate : 0;
  const vat = Math.round((net * rate) / 100);
  return { net, vat, gross: net + vat };
}

/**
 * Net subtotals grouped by cost code (KID/MRD/DOD/SZD/VIZSGALAT), preserving the
 * order lines appear in. Lines without a code fall under an empty-string bucket.
 * Useful for the quote document's per-method breakdown.
 */
export function subtotalsByCode(
  lines: ReadonlyArray<QuoteLineInput>,
): { code: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const code = line.costCode ?? "";
    totals.set(code, (totals.get(code) ?? 0) + lineAmount(line));
  }
  return [...totals.entries()].map(([code, amount]) => ({ code, amount }));
}
