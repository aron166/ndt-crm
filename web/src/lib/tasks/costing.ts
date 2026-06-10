// NDT billing cost codes. Each field job breaks down into these five revenue/cost
// components — see memory/ndt-domain.md. Cost codes carry MEASURABLE amounts
// (quantity × unit rate → HUF), the foundation for automatic invoicing
// (decisions.md #15). `unitHint` is just a default unit suggestion in the UI; the
// real unit is a free, dynamic value (m² for surface methods, db per element, etc.).
export interface CostCode {
  value: string;
  label: string;
  description: string;
  unitHint: string;
}

export const COST_CODES: CostCode[] = [
  { value: "KID",       label: "KID — Kiszállási díj",        description: "Kiszállás / utazás", unitHint: "km" },
  { value: "MRD",       label: "MRD — Rendelkezésre állás",   description: "Minimális rendelkezésre állási díj", unitHint: "alkalom" },
  { value: "DOD",       label: "DOD — Dokumentáció",          description: "Dokumentációs díj", unitHint: "db" },
  { value: "SZD",       label: "SZD — Személyzeti díj",       description: "Helyszíni munkaidő", unitHint: "óra" },
  { value: "VIZSGALAT", label: "VIZSGÁLAT — Vizsgálat",       description: "Vizsgálat / mérés", unitHint: "db" },
];

const COST_CODE_BY_VALUE = new Map(COST_CODES.map((c) => [c.value, c]));

export function costCodeLabel(code: string | null | undefined): string {
  if (!code) return "";
  return COST_CODE_BY_VALUE.get(code)?.label ?? code;
}

export function costCodeUnitHint(code: string | null | undefined): string {
  if (!code) return "";
  return COST_CODE_BY_VALUE.get(code)?.unitHint ?? "";
}

/**
 * Billable amount for a cost line = quantity × unit rate, in HUF.
 * Returns null when either input is missing/invalid (an incomplete line is not
 * billable). Rounded to whole HUF (Hungarian invoicing has no fillér in practice).
 */
export function computeCostAmount(
  quantity: number | null | undefined,
  unitRate: number | null | undefined,
): number | null {
  if (quantity == null || unitRate == null) return null;
  if (!Number.isFinite(quantity) || !Number.isFinite(unitRate)) return null;
  return Math.round(quantity * unitRate);
}

/**
 * Prisma Decimal → number for crossing the RSC→client boundary. Use this for the
 * cost fields when a page passes raw Prisma tasks to a client component (so Date
 * fields stay Date — serializeDates would stringify them and break `.toISOString()`).
 */
export function numFromDecimal(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = Number(v as { toString(): string });
  return Number.isFinite(n) ? n : null;
}

/** Map a task's three Decimal cost fields to numbers, leaving everything else intact. */
export function serializeTaskCost<
  T extends { costQuantity?: unknown; costUnitRate?: unknown; costAmount?: unknown },
>(
  t: T,
): Omit<T, "costQuantity" | "costUnitRate" | "costAmount"> & {
  costQuantity: number | null;
  costUnitRate: number | null;
  costAmount: number | null;
} {
  return {
    ...t,
    costQuantity: numFromDecimal(t.costQuantity),
    costUnitRate: numFromDecimal(t.costUnitRate),
    costAmount: numFromDecimal(t.costAmount),
  };
}

export interface TaskCostLine {
  costCode: string | null;
  costAmount: number | null;
}

/**
 * Roll a job's cost up: the task's own line plus every subtask, grouped by cost
 * code, with a grand total. Lines without a code or amount contribute nothing.
 * This is what an invoice would draw from (decisions.md #15).
 */
export function rollupTaskCost(
  task: TaskCostLine,
  subTasks: TaskCostLine[] = [],
): { byCode: { code: string; amount: number }[]; total: number } {
  const totals = new Map<string, number>();
  for (const line of [task, ...subTasks]) {
    if (!line.costCode || line.costAmount == null) continue;
    totals.set(line.costCode, (totals.get(line.costCode) ?? 0) + line.costAmount);
  }
  // Preserve canonical cost-code order, then any unknown codes.
  const ordered = [
    ...COST_CODES.map((c) => c.value).filter((v) => totals.has(v)),
    ...[...totals.keys()].filter((k) => !COST_CODE_BY_VALUE.has(k)),
  ];
  const byCode = ordered.map((code) => ({ code, amount: totals.get(code)! }));
  const total = byCode.reduce((s, l) => s + l.amount, 0);
  return { byCode, total };
}
