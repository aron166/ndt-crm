import { db } from "@/lib/db";
import { serializeDates } from "@/lib/serialize";
import { json, leadApiCtx } from "@/lib/leads/api";
import { DEAL_API_SELECT, dealListQuerySchema } from "@/lib/deals/api";

/** GET /api/deals?pipeline_id=&stage_id=&page=&page_size= (app key), newest first. */
export async function GET(request: Request) {
  const auth = await leadApiCtx(request);
  if ("res" in auth) return auth.res;
  const q = dealListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) return json({ error: "Validation failed", details: q.error.flatten() }, 400);
  const { pipeline_id, stage_id, page, page_size } = q.data;
  const where = {
    tenantId: auth.ctx.tenantId,
    ...(pipeline_id ? { pipelineId: pipeline_id } : {}),
    ...(stage_id ? { stageId: stage_id } : {}),
  };
  const [items, total] = await Promise.all([
    db.deal.findMany({ where, select: DEAL_API_SELECT, orderBy: { createdAt: "desc" }, skip: (page - 1) * page_size, take: page_size }),
    db.deal.count({ where }),
  ]);
  return json({
    ok: true,
    items: serializeDates(items.map((d) => ({ ...d, value: d.value != null ? Number(d.value) : null }))),
    page, page_size, total, total_pages: Math.ceil(total / page_size),
  });
}
