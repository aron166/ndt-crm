import { db } from "@/lib/db";
import { getScriptVariants } from "./queries";

export interface ScriptStatRow {
  key: string;
  label: string;
  calls: number;
  byOutcome: Record<string, number>;
  demoRate: number;
}

/**
 * Per-variant call-outcome breakdown over the last `days`. A variant whose key
 * only exists in history (deleted from settings) still shows up — deleting a
 * script must not silently drop its stats (see lib/leads/scripts.ts).
 */
export async function getScriptStats(tenantId: number, days = 90): Promise<ScriptStatRow[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const [variants, groups] = await Promise.all([
    getScriptVariants(tenantId),
    db.interaction.groupBy({
      by: ["scriptVariant", "outcome"],
      where: { tenantId, type: "call", scriptVariant: { not: null }, occurredAt: { gte: since } },
      _count: true,
    }),
  ]);

  const rows = new Map<string, ScriptStatRow>();
  for (const v of variants) rows.set(v.key, { key: v.key, label: v.label, calls: 0, byOutcome: {}, demoRate: 0 });

  for (const g of groups) {
    const key = g.scriptVariant;
    if (!key) continue;
    if (!rows.has(key)) rows.set(key, { key, label: `(törölt) ${key}`, calls: 0, byOutcome: {}, demoRate: 0 });
    const row = rows.get(key)!;
    const count = g._count;
    row.calls += count;
    if (g.outcome) row.byOutcome[g.outcome] = (row.byOutcome[g.outcome] ?? 0) + count;
  }

  for (const row of rows.values()) {
    row.demoRate = row.calls === 0 ? 0 : (row.byOutcome["meeting_booked"] ?? 0) / row.calls;
  }

  return [...rows.values()].sort((a, b) => b.calls - a.calls);
}
