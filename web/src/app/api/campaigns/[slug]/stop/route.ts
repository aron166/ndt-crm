import { campaignCtx, failRes, json, slugParam } from "@/lib/campaigns/api";
import { setCampaignStatus } from "@/lib/campaigns/service";

type P = { params: Promise<{ slug: string }> };

/** POST /api/campaigns/:slug/stop (session only): final. */
export async function POST(request: Request, { params }: P) {
  const a = await campaignCtx(request, { sessionOnly: true });
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const r = await setCampaignStatus(a.ctx, slug.data, "stopped");
  return "error" in r ? failRes(r) : json(r);
}
