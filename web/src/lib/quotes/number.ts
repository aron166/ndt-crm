// Quote number generation. Human-facing id on every árajánlat: AJ-YYYY-NNNN
// (AJ = ajánlat), a per-tenant, per-year running sequence. Pure helpers — the
// action supplies the current year and the tenant's latest number for that year.

export const QUOTE_NUMBER_PREFIX = "AJ";
const SEQ_PAD = 4;

/** Format a sequence number into the canonical quote number for a year. */
export function formatQuoteNumber(year: number, seq: number): string {
  return `${QUOTE_NUMBER_PREFIX}-${year}-${String(seq).padStart(SEQ_PAD, "0")}`;
}

/**
 * Parse the sequence out of a quote number for a given year, or null if it
 * doesn't match the AJ-YYYY-NNNN shape for that year. Lets the action find the
 * highest sequence already used without trusting row order.
 */
export function parseQuoteSeq(quoteNumber: string, year: number): number | null {
  const m = new RegExp(`^${QUOTE_NUMBER_PREFIX}-${year}-(\\d+)$`).exec(quoteNumber);
  if (!m) return null;
  const seq = Number(m[1]);
  return Number.isInteger(seq) && seq > 0 ? seq : null;
}

/**
 * Next quote number for a year given the quote numbers already issued (any year;
 * non-matching ones are ignored). The new sequence is max(existing for year) + 1,
 * starting at 1.
 */
export function nextQuoteNumber(
  existingNumbers: ReadonlyArray<string>,
  year: number,
): string {
  let max = 0;
  for (const n of existingNumbers) {
    const seq = parseQuoteSeq(n, year);
    if (seq !== null && seq > max) max = seq;
  }
  return formatQuoteNumber(year, max + 1);
}
