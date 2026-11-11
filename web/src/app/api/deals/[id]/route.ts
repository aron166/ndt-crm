import { db } from "@/lib/db";
import { serializeDates } from "@/lib/serialize";
import { json, leadApiCtx, parseLeadId, readJson } from "@/lib/leads/api";
import { DEAL_API_SELECT, dealPatchSchema } from "@/lib/deals/api";
import { dealStageError, moveDealToStage, patchDealCustomFields } from "@/lib/deals/service";

type Params = { params: Promise<{ id: string }> };

async function load(tenantId: number, id: number) {
  const deal = await db.deal.findFirst({
    where: { id, tenantId },
    select: {
      ...DEAL_API_SELECT,
      pipeline: {
        select: {
          name: true,
          stages: { select: { id: true, name: true, position: true, isTerminalWon: true, isTerminalLost: true }, orderBy: { position: "asc" } },
          customFields: { select: { key: true, label: true, type: true, options: true }, orderBy: { position: "asc" } },
        },
      },
    },
  });
  return deal ? serializeDates({ ...deal, value: deal.value != null ? Number(deal.value) : null }) : null;
}

/** GET /api/deals/:id: the deal, its pipeline's stages and writable custom fields. */
export async function GET(request: Request, { params }: Params) {
  const auth = await leadApiCtx(request);
  if ("res" in auth) return auth.res;
  const id = parseLeadId((await params).id);
  if (id == null) return json({ error: "Invalid id" }, 400);
  const deal = await load(auth.ctx.tenantId, id);
  if (!deal) return json({ error: "Not found" }, 404);
  return json({ ok: true, deal });
}

/** PATCH /api/deals/:id: { custom_fields?, stage_id? }. Fields first, then the move (which fires automations). */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await leadApiCtx(request);
  if ("res" in auth) return auth.res;
  const id = parseLeadId((await params).id);
  if (id == null) return json({ error: "Invalid id" }, 400);
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = dealPatchSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  const { tenantId } = auth.ctx;
  const auditOpts = { tenantId, actor: "agent" as const, actorAgentId: auth.ctx.actorAgentId };

  const exists = await db.deal.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!exists) return json({ error: "Not found" }, 404);
  // Refuse a bad stage BEFORE any field is written: a 400 writes nothing (Vanda #185-1).
  if (parsed.data.stage_id !== undefined) {
    const err = await dealStageError(tenantId, id, parsed.data.stage_id);
    if (err) return json({ error: err }, 400);
  }
  if (parsed.data.custom_fields) {
    const r = await patchDealCustomFields(tenantId, id, parsed.data.custom_fields, auditOpts);
    if ("error" in r) return json({ error: r.error }, 400);
  }
  if (parsed.data.stage_id !== undefined) {
    const r = await moveDealToStage(tenantId, id, parsed.data.stage_id, { samePipeline: true, audit: auditOpts });
    if ("error" in r) return json({ error: r.error }, 400);
  }
  return json({ ok: true, deal: await load(tenantId, id) });
}
