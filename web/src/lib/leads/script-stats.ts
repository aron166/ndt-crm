import { db } from "@/lib/db";
import type { ScriptVariant } from "./scripts";

export interface ScriptStatRow {
  key: string;
  label: string;
  calls: number;
  /** calls minus no_answer/wrong_number — nobody was actually pitched on those,
   * so they would only dilute demoRate for a variant unlucky enough to draw a
   * batch of dead numbers. */
  reached: number;
  byOutcome: Record<string, number>;
  /** meeting_booked / reached (0 when reached === 0 — never NaN, never counts
   * unanswered calls against the variant). */
  demoRate: number;
}

/**
 * Per-variant call-outcome breakdown over the last `days`. A variant whose key
 * only exists in history (deleted from settings) still shows up — deleting a
 * script must not silently drop its stats (see lib/leads/scripts.ts).
 *
 * `variants` is passed in (not re-fetched here) because callers that already
 * hold the tenant's script variants (e.g. the setup page) would otherwise do
 * two identical tenant reads per page load.
 */
export async function getScriptStats(tenantId: number, variants: ScriptVariant[], days = 90): Promise<ScriptStatRow[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const groups = await db.interaction.groupBy({
    by: ["scriptVariant", "outcome"],
    where: { tenantId, type: "call", scriptVariant: { not: null }, occurredAt: { gte: since } },
    _count: true,
  });

  const rows = new Map<string, ScriptStatRow>();
  for (const v of variants) rows.set(v.key, { key: v.key, label: v.label, calls: 0, reached: 0, byOutcome: {}, demoRate: 0 });

  for (const g of groups) {
    const key = g.scriptVariant;
    if (!key) continue;
    if (!rows.has(key)) rows.set(key, { key, label: `(törölt) ${key}`, calls: 0, reached: 0, byOutcome: {}, demoRate: 0 });
    const row = rows.get(key)!;
    const count = g._count;
    row.calls += count;
    if (g.outcome) row.byOutcome[g.outcome] = (row.byOutcome[g.outcome] ?? 0) + count;
  }

  for (const row of rows.values()) {
    row.reached = row.calls - (row.byOutcome["no_answer"] ?? 0) - (row.byOutcome["wrong_number"] ?? 0);
    row.demoRate = row.reached === 0 ? 0 : (row.byOutcome["meeting_booked"] ?? 0) / row.reached;
  }

  return [...rows.values()].sort((a, b) => b.calls - a.calls);
}
