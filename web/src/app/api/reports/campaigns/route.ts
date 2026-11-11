import { campaignCtx, json } from "@/lib/campaigns/api";
import { campaignAnalytics } from "@/lib/campaigns/analytics";

/** GET /api/reports/campaigns (app key or session): the same stats for every RUNNING campaign (the analytics strip). */
export async function GET(request: Request) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  return json({ ok: true, items: await campaignAnalytics(a.ctx.tenantId) });
}
