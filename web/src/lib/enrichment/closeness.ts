// Closeness score (0–100) — how "close" a lead's history makes them, from two
// signals: money already paid (invoices) and how recently/often they engaged
// (interactions). Pure module: no DB, no server-only import, so it can be unit
// tested and reused by API + UI without dragging Prisma along.
//
// Score = round(revenuePoints + interactionPoints), clamped to 0..100.
//
// 1. Revenue points (max 45): sum invoice.netAmount, ignoring null; a negative
//    total counts as 0. Looked up in REVENUE_THRESHOLDS (HUF) — highest
//    threshold the total meets or exceeds wins.
//
// 2. Interaction points (max 55): each interaction contributes
//    INTERACTION_WEIGHT[type] (default weight for unknown/null type) times
//    RECENCY_FACTOR for how long ago occurredAt was relative to `now` (a
//    future-dated interaction is treated as "just happened", factor 1.0).
//    The per-interaction contributions are summed, then capped at 55.

export type ClosenessInvoice = { netAmount: number | null };
export type ClosenessInteraction = { type: string | null; occurredAt: Date };
export type ClosenessInput = {
  invoices: ClosenessInvoice[];
  interactions: ClosenessInteraction[];
  now?: Date; // defaults to new Date(); always injectable so tests are deterministic
};

const MAX_REVENUE_POINTS = 45;
const MAX_INTERACTION_POINTS = 55;

// Highest threshold met-or-exceeded by the total wins. Order matters (checked
// low to high, last match kept).
export const REVENUE_THRESHOLDS: readonly { min: number; points: number }[] = [
  { min: 0, points: 0 },
  { min: 1, points: 10 },
  { min: 1_000_000, points: 20 },
  { min: 5_000_000, points: 30 },
  { min: 20_000_000, points: 40 },
  { min: 50_000_000, points: 45 },
];

export const INTERACTION_WEIGHT: Record<string, number> = {
  meeting: 8,
  site_visit: 8,
  call: 5,
  email: 3,
};
const DEFAULT_INTERACTION_WEIGHT = 2;

// Highest day-threshold met by the interaction's age wins; older than the last
// bucket falls through to the default factor.
export const RECENCY_FACTOR: readonly { maxDays: number; factor: number }[] = [
  { maxDays: 30, factor: 1.0 },
  { maxDays: 90, factor: 0.7 },
  { maxDays: 365, factor: 0.4 },
];
const DEFAULT_RECENCY_FACTOR = 0.15;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between `date` and `now`, never negative (future dates → 0). */
function daysAgo(date: Date, now: Date): number {
  const diff = Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY);
  return Math.max(0, diff);
}

function revenuePoints(invoices: ClosenessInvoice[]): number {
  const total = invoices.reduce((sum, inv) => sum + (inv.netAmount ?? 0), 0);
  if (total <= 0) return 0;
  let points = 0;
  for (const t of REVENUE_THRESHOLDS) {
    if (total >= t.min) points = t.points;
  }
  return Math.min(points, MAX_REVENUE_POINTS);
}

function recencyFactor(days: number): number {
  for (const r of RECENCY_FACTOR) {
    if (days <= r.maxDays) return r.factor;
  }
  return DEFAULT_RECENCY_FACTOR;
}

function interactionPoints(interactions: ClosenessInteraction[], now: Date): number {
  const total = interactions.reduce((sum, i) => {
    const weight = i.type != null ? (INTERACTION_WEIGHT[i.type] ?? DEFAULT_INTERACTION_WEIGHT) : DEFAULT_INTERACTION_WEIGHT;
    const factor = recencyFactor(daysAgo(i.occurredAt, now));
    return sum + weight * factor;
  }, 0);
  return Math.min(total, MAX_INTERACTION_POINTS);
}

export function computeClosenessScore(input: ClosenessInput): number {
  const now = input.now ?? new Date();
  const points = revenuePoints(input.invoices) + interactionPoints(input.interactions, now);
  return Math.min(100, Math.max(0, Math.round(points)));
}
