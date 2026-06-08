// "Equalizer" — internal revenue-mix planning tool (decisions/backlog: Round 2 #5).
// Pure, DB-free math. The UI sets the inputs; this file just computes. No fake
// data lives here — the per-unit economics are user inputs, defaulted to 0.

export interface RevenueStream {
  key: string;
  label: string;
  /** HUF earned per one unit of this stream (user-set; 0 until entered). */
  unitValue: number;
  /** How many units of this stream are in the plan (the slider). */
  quantity: number;
}

/** The four streams Péter named. Values/quantities start empty — set in the UI. */
export const EQUALIZER_STREAMS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "demo",         label: "Demó" },
  { key: "standard",     label: "Standard" },
  { key: "unlimited",    label: "Unlimited" },
  { key: "machine_sale", label: "Gépeladás" },
];

const nonNeg = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

/** Revenue contributed by a single stream (never negative). */
export function streamRevenue(s: Pick<RevenueStream, "unitValue" | "quantity">): number {
  return nonNeg(s.unitValue) * nonNeg(s.quantity);
}

/** Total revenue across all streams. */
export function totalRevenue(streams: ReadonlyArray<Pick<RevenueStream, "unitValue" | "quantity">>): number {
  return streams.reduce((sum, s) => sum + streamRevenue(s), 0);
}

/** target − total. Positive = short of target; negative = over. */
export function gapToTarget(streams: ReadonlyArray<Pick<RevenueStream, "unitValue" | "quantity">>, target: number): number {
  return nonNeg(target) - totalRevenue(streams);
}

/**
 * Quantity of ONE stream needed to hit `target`, holding the others fixed.
 * Returns null when the stream has no unit value (can't solve / divide by zero).
 * Never returns negative — if the others already exceed the target, returns 0.
 */
export function quantityToHitTarget(
  streams: ReadonlyArray<RevenueStream>,
  streamKey: string,
  target: number,
): number | null {
  const stream = streams.find((s) => s.key === streamKey);
  if (!stream) return null;
  const unit = nonNeg(stream.unitValue);
  if (unit === 0) return null;

  const others = streams
    .filter((s) => s.key !== streamKey)
    .reduce((sum, s) => sum + streamRevenue(s), 0);

  const needed = (nonNeg(target) - others) / unit;
  return needed <= 0 ? 0 : Math.ceil(needed);
}

/** Each stream's share of the total revenue, 0..1 (0 when total is 0). */
export function revenueShares(
  streams: ReadonlyArray<RevenueStream>,
): Array<{ key: string; revenue: number; share: number }> {
  const total = totalRevenue(streams);
  return streams.map((s) => {
    const revenue = streamRevenue(s);
    return { key: s.key, revenue, share: total > 0 ? revenue / total : 0 };
  });
}
