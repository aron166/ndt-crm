import { campaignCtx, failRes, json, slugParam } from "@/lib/campaigns/api";
import { approveCampaign } from "@/lib/campaigns/service";

type P = { params: Promise<{ slug: string }> };

/** POST /api/campaigns/:slug/approve (session only, Áron only): approve and launch. Stores the hash of members, steps and cap. */
export async function POST(request: Request, { params }: P) {
  const a = await campaignCtx(request, { sessionOnly: true });
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const r = await approveCampaign(a.ctx, slug.data);
  return "error" in r ? failRes(r) : json(r);
}
