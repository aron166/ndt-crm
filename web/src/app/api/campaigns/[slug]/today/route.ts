import { serializeDates } from "@/lib/serialize";
import { campaignCtx, failRes, json, slugParam } from "@/lib/campaigns/api";
import { dailyList } from "@/lib/campaigns/service";

type P = { params: Promise<{ slug: string }> };

/** GET /api/campaigns/:slug/today (app key or session): today's capped call list, computed on read, plus the campaign's live call script. */
export async function GET(request: Request, { params }: P) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const r = await dailyList(a.ctx.tenantId, slug.data);
  return "error" in r ? failRes(r) : json(serializeDates(r));
}
