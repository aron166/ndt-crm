import { serializeDates } from "@/lib/serialize";
import { body, campaignCtx, createSchema, failRes, json } from "@/lib/campaigns/api";
import { createCampaign, listCampaigns } from "@/lib/campaigns/service";

/** GET /api/campaigns?archived=1 (app key or session): every campaign with its steps and member counts by state. */
export async function GET(request: Request) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  const archived = new URL(request.url).searchParams.get("archived") === "1";
  return json({ ok: true, items: serializeDates(await listCampaigns(a.ctx.tenantId, { includeArchived: archived })) });
}

/** POST /api/campaigns (app key or session): a new campaign, always a draft. */
export async function POST(request: Request) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  const b = await body(request, createSchema);
  if ("res" in b) return b.res;
  const r = await createCampaign(a.ctx, b.data as Parameters<typeof createCampaign>[1]);
  return "error" in r ? failRes(r) : json(r, 201);
}
