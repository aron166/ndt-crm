import { campaignCtx, failRes, json, slugParam } from "@/lib/campaigns/api";
import { setCampaignStatus } from "@/lib/campaigns/service";

type P = { params: Promise<{ slug: string }> };

/** POST /api/campaigns/:slug/pause (app key or session): the safe direction; resuming is a new approval. */
export async function POST(request: Request, { params }: P) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const r = await setCampaignStatus(a.ctx, slug.data, "paused");
  return "error" in r ? failRes(r) : json(r);
}
