// Hungarian copy is PROPOSAL until Áron approves.
import { db } from "@/lib/db";
import { budapestMidnight } from "@/lib/reports/weekly";

export const DEFAULT_MONTHLY_TOKEN_CAP = 2_000_000;

export function capFromSettings(settings: unknown): number {
  const v = (settings as { assistantMonthlyTokenCap?: unknown } | null)?.assistantMonthlyTokenCap;
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : DEFAULT_MONTHLY_TOKEN_CAP;
}

/** Start of the Europe/Budapest calendar month as a UTC instant. */
export function monthStart(now: Date): Date {
  const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(now).slice(0, 7);
  // Midday UTC is on the same Budapest date year-round, so budapestMidnight lands on the 1st.
  return budapestMidnight(new Date(`${ym}-01T12:00:00Z`));
}

export async function monthUsage(tenantId: number, now: Date = new Date()): Promise<{ calls: number; tokens: number; costUsd: number }> {
  const a = await db.assistantCall.aggregate({
    where: { tenantId, purpose: { not: "execute" }, createdAt: { gte: monthStart(now) } },
    _count: { _all: true },
    _sum: { promptTokens: true, completionTokens: true, costUsd: true },
  });
  return {
    calls: a._count._all,
    tokens: (a._sum.promptTokens ?? 0) + (a._sum.completionTokens ?? 0),
    costUsd: Number(a._sum.costUsd ?? 0),
  };
}

export async function capState(tenantId: number, now: Date = new Date()): Promise<{ used: number; cap: number; exceeded: boolean }> {
  const [usage, tenant] = await Promise.all([
    monthUsage(tenantId, now),
    db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
  ]);
  const cap = capFromSettings(tenant?.settings);
  return { used: usage.tokens, cap, exceeded: usage.tokens >= cap };
}

export const CAP_EXCEEDED = "Elérte a havi asszisztens-keretet. A következő hónap elején újraindul, vagy szóljon Áronnak.";
