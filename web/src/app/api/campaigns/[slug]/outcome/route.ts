import { body, campaignCtx, failRes, json, slugParam, outcomeSchema } from "@/lib/campaigns/api";
import { recordOutcome } from "@/lib/campaigns/service";

type P = { params: Promise<{ slug: string }> };

/** POST /api/campaigns/:slug/outcome (app key or session): log one touch outcome on a member; applies the promotion rule. */
export async function POST(request: Request, { params }: P) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const b = await body(request, outcomeSchema);
  if ("res" in b) return b.res;
  const r = await recordOutcome(a.ctx, slug.data, b.data as Parameters<typeof recordOutcome>[2]);
  return "error" in r ? failRes(r) : json(r);
}
