import { body, campaignCtx, failRes, json, slugParam, stepsSchema } from "@/lib/campaigns/api";
import { setSteps } from "@/lib/campaigns/service";

type P = { params: Promise<{ slug: string }> };

/** PUT /api/campaigns/:slug/steps (session only): replace the step list. On a running or paused campaign this sends it back to draft. */
export async function PUT(request: Request, { params }: P) {
  const a = await campaignCtx(request, { sessionOnly: true });
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const b = await body(request, stepsSchema);
  if ("res" in b) return b.res;
  const r = await setSteps(a.ctx, slug.data, b.data as Parameters<typeof setSteps>[2]);
  return "error" in r ? failRes(r) : json(r);
}
