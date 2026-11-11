import { campaignCtx, json, slugParam } from "@/lib/campaigns/api";
import { campaignAnalytics } from "@/lib/campaigns/analytics";

type P = { params: Promise<{ slug: string }> };

/** GET /api/campaigns/:slug/analytics (app key or session): audience, touched, replied, promoted, booked; by step and by Budapest day. */
export async function GET(request: Request, { params }: P) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const [row] = await campaignAnalytics(a.ctx.tenantId, { slug: slug.data });
  return row ? json({ ok: true, ...row }) : json({ error: "Kampány nem található" }, 404);
}
