import { db } from "@/lib/db";
import { audit, type AuditOptions } from "@/lib/audit";
import { runAutomations } from "@/lib/automations/engine";

// The ONE write path for a deal stage move and a custom-field patch, shared by the
// /deals board (actions/deals.ts) and the app-key API (/api/deals/:id). Transport-agnostic.

export type DealResult<T = object> = ({ success: true } & T) | { error: string };

/**
 * Move a deal to a stage. A real stage change resets the idle clock and fires
 * deal_stage_changed; a move within the same stage only reorders.
 * `samePipeline` (API callers) refuses a stage of another pipeline.
 * No position = the end of the target stage.
 */
export async function moveDealToStage(
  tenantId: number,
  dealId: number,
  stageId: number,
  opts: { position?: number; samePipeline?: boolean; audit?: AuditOptions } = {},
): Promise<DealResult<{ changed: boolean }>> {
  const deal = await db.deal.findFirst({
    where: { id: dealId, tenantId },
    select: {
      stageId: true, pipelineId: true, companyId: true, personId: true, value: true,
      stage: { select: { name: true } },
      company: { select: { name: true } },
    },
  });
  if (!deal) return { error: "Deal nem található" };
  const newStage = await db.pipelineStage.findFirst({
    where: { id: stageId, pipeline: { tenantId } },
    select: { name: true, pipelineId: true },
  });
  if (!newStage) return { error: "Szakasz nem található" };
  // A legacy deal with no pipeline may be placed into any of the tenant's pipelines.
  if (opts.samePipeline && deal.pipelineId != null && newStage.pipelineId !== deal.pipelineId) return { error: "A szakasz másik pipeline-hoz tartozik" };

  const stageChanged = deal.stageId !== stageId;
  let position = opts.position;
  if (position === undefined) {
    const max = await db.deal.aggregate({ where: { tenantId, stageId }, _max: { position: true } });
    position = (max._max.position ?? -1) + 1;
  }
  await db.deal.updateMany({
    where: { id: dealId, tenantId },
    data: {
      stageId, position, updatedAt: new Date(),
      ...(stageChanged ? { stageEnteredAt: new Date(), pipelineId: newStage.pipelineId } : {}),
    },
  });
  audit("deal", dealId, "update",
    { stageId: deal.stageId, stageName: deal.stage?.name },
    { stageId, stageName: newStage.name },
    opts.audit,
  );
  if (stageChanged) {
    await runAutomations({
      type: "deal_stage_changed",
      tenantId,
      companyId: deal.companyId,
      personId: deal.personId,
      dealId,
      companyName: deal.company?.name ?? null,
      toStageId: stageId,
      fields: {
        company: deal.company?.name ?? null,
        stageId,
        value: deal.value != null ? Number(deal.value) : null,
      },
    });
  }
  return { success: true, changed: stageChanged };
}

/** The move's checks without the move, so an API PATCH can refuse before writing anything. */
export async function dealStageError(tenantId: number, dealId: number, stageId: number): Promise<string | null> {
  const [deal, stage] = await Promise.all([
    db.deal.findFirst({ where: { id: dealId, tenantId }, select: { pipelineId: true } }),
    db.pipelineStage.findFirst({ where: { id: stageId, pipeline: { tenantId } }, select: { pipelineId: true } }),
  ]);
  if (!deal) return "Deal nem található";
  if (!stage) return "Szakasz nem található";
  if (deal.pipelineId != null && stage.pipelineId !== deal.pipelineId) return "A szakasz másik pipeline-hoz tartozik";
  return null;
}

/**
 * The /deals modal's cf_ form fields as a custom-field map. A multi_select posts
 * `cf_<key>[]` once per ticked box: joined with commas under `<key>` (Vanda #185-4).
 */
export function customFieldsFromForm(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of new Set([...formData.keys()])) {
    if (!k.startsWith("cf_")) continue;
    if (k.endsWith("[]")) {
      const v = formData.getAll(k).map(String).map((x) => x.trim()).filter(Boolean).join(",");
      if (v) out[k.slice(3, -2)] = v;
    } else {
      const v = String(formData.get(k) ?? "");
      if (v.trim()) out[k.slice(3)] = v;
    }
  }
  return out;
}

interface FieldDef { key: string; type: string; options: unknown }

/**
 * Check one value against its pipeline field, in the same string form the
 * /deals modal stores (multi_select = comma-joined options). Returns an error or null.
 */
export function customFieldError(f: FieldDef, value: string): string | null {
  const opts = Array.isArray(f.options) ? f.options.filter((o): o is string => typeof o === "string") : [];
  switch (f.type) {
    case "number":
      return /^-?\d+(\.\d+)?$/.test(value) ? null : `${f.key}: szám kell`;
    case "date":
      // Round-trip: rejects rolled-over dates like 2026-02-30.
      {
        const t = Date.parse(`${value}T00:00:00Z`);
        return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(t) && new Date(t).toISOString().startsWith(value) ? null : `${f.key}: dátum kell (ÉÉÉÉ-HH-NN)`;
      }
    case "single_select":
      return opts.includes(value) ? null : `${f.key}: ismeretlen opció`;
    case "multi_select":
      return value.split(",").every((v) => opts.includes(v)) ? null : `${f.key}: ismeretlen opció`;
    default:
      return null;
  }
}

/**
 * Merge values into deal.custom_fields. Only keys the deal's pipeline defines are
 * writable, so the system keys (fromLeadId, saleKind, offerType) can never be
 * overwritten from outside. null deletes a key.
 */
export async function patchDealCustomFields(
  tenantId: number,
  dealId: number,
  patch: Record<string, string | null>,
  auditOpts?: AuditOptions,
): Promise<DealResult> {
  const deal = await db.deal.findFirst({
    where: { id: dealId, tenantId },
    select: { customFields: true, pipeline: { select: { customFields: { select: { key: true, type: true, options: true } } } } },
  });
  if (!deal) return { error: "Deal nem található" };
  const defs = new Map((deal.pipeline?.customFields ?? []).map((f) => [f.key, f]));
  for (const [k, v] of Object.entries(patch)) {
    const f = defs.get(k);
    if (!f) return { error: `Ismeretlen mező: ${k}` };
    if (v !== null) {
      const err = customFieldError(f, v);
      if (err) return { error: err };
    }
  }
  const before = (deal.customFields ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...before };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  await db.deal.updateMany({ where: { id: dealId, tenantId }, data: { customFields: next as object, updatedAt: new Date() } });
  audit("deal", dealId, "update", { customFields: before }, { customFields: next }, auditOpts);
  return { success: true };
}
