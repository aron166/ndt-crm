"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { COST_CODES } from "@/lib/tasks/costing";

const TENANT_ID = 1;

export interface CostRateEntry {
  code: string;
  unit: string | null;
  unitRate: number | null;
}

/** The full rate card: one entry per cost code, in canonical order (defaults null). */
export async function getCostRates(): Promise<CostRateEntry[]> {
  const rows = await db.costRate.findMany({ where: { tenantId: TENANT_ID } });
  const byCode = new Map(rows.map((r) => [r.code, r]));
  return COST_CODES.map((c) => {
    const r = byCode.get(c.value);
    return {
      code: c.value,
      unit: r?.unit ?? null,
      unitRate: r?.unitRate != null ? Number(r.unitRate) : null,
    };
  });
}

export async function upsertCostRate(code: string, unit: string, unitRate: string) {
  if (!COST_CODES.some((c) => c.value === code)) return { error: "Ismeretlen költségkód" };
  const trimmed = unitRate.trim();
  const rate = trimmed ? Number(trimmed.replace(",", ".")) : null;
  if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
    return { error: "Érvénytelen egységár" };
  }

  const saved = await db.costRate.upsert({
    where: { tenantId_code: { tenantId: TENANT_ID, code } },
    update: { unit: unit.trim() || null, unitRate: rate },
    create: { tenantId: TENANT_ID, code, unit: unit.trim() || null, unitRate: rate },
  });
  audit("cost_rate", saved.id, "update", null, { code, unit: unit.trim() || null, unitRate: rate }, { tenantId: TENANT_ID });

  revalidatePath("/rate-card");
  return { success: true };
}
