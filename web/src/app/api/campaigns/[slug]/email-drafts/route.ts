import { campaignCtx, failRes, json, slugParam } from "@/lib/campaigns/api";
import { draftEmailStep } from "@/lib/campaigns/service";

type P = { params: Promise<{ slug: string }> };

/**
 * POST /api/campaigns/:slug/email-drafts (session only, admin or manager): today's e-mail step work as
 * DRAFTS in the Outreach queue (item 4). Nothing is sent here; the gated sender sends after approval.
 */
export async function POST(request: Request, { params }: P) {
  const a = await campaignCtx(request, { sessionOnly: true });
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const r = await draftEmailStep(a.ctx, slug.data);
  return "error" in r ? failRes(r) : json(r, 201);
}
