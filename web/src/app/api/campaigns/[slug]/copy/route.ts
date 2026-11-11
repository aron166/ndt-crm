import { body, campaignCtx, failRes, json, slugParam } from "@/lib/campaigns/api";
import { copyLoadSchema, loadSegmentCopy } from "@/lib/campaigns/copy-load";

type P = { params: Promise<{ slug: string }> };

/**
 * POST /api/campaigns/:slug/copy (SESSION ONLY): load a segment copy file onto an e-mail step as
 * proposals in the content approval queue (in review, never approved or live). dry_run defaults to true.
 */
export async function POST(request: Request, { params }: P) {
  const a = await campaignCtx(request, { sessionOnly: true });
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const b = await body(request, copyLoadSchema);
  if ("res" in b) return b.res;
  const r = await loadSegmentCopy(a.ctx, slug.data, b.data);
  return "error" in r ? failRes(r) : json(r);
}
