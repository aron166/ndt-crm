import { body, campaignCtx, failRes, json, slugParam, specifySchema } from "@/lib/campaigns/api";
import { specifyCampaign } from "@/lib/campaigns/service";

type P = { params: Promise<{ slug: string }> };

/** POST /api/campaigns/:slug/specify (app key or session): an agent proposes the brief, steps and assets. Proposals only: brief_proposal plus content items in review; never members, cap, status or approval. */
export async function POST(request: Request, { params }: P) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const b = await body(request, specifySchema);
  if ("res" in b) return b.res;
  const r = await specifyCampaign(a.ctx, slug.data, b.data as Parameters<typeof specifyCampaign>[2]);
  return "error" in r ? failRes(r) : json(r);
}
