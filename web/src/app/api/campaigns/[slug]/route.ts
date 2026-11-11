import { serializeDates } from "@/lib/serialize";
import { body, campaignCtx, failRes, json, patchSchema, slugParam } from "@/lib/campaigns/api";
import { getCampaign, updateCampaign } from "@/lib/campaigns/service";

type P = { params: Promise<{ slug: string }> };

/** GET /api/campaigns/:slug (app key or session). */
export async function GET(request: Request, { params }: P) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const c = await getCampaign(a.ctx.tenantId, slug.data);
  return c ? json({ ok: true, campaign: serializeDates(c) }) : json({ error: "Kampány nem található" }, 404);
}

/** PATCH /api/campaigns/:slug (session only): name, cap, owner, dates, brief. A cap change on a running campaign sends it back to draft. */
export async function PATCH(request: Request, { params }: P) {
  const a = await campaignCtx(request, { sessionOnly: true });
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const b = await body(request, patchSchema);
  if ("res" in b) return b.res;
  const r = await updateCampaign(a.ctx, slug.data, b.data as Parameters<typeof updateCampaign>[2]);
  return "error" in r ? failRes(r) : json(r);
}
