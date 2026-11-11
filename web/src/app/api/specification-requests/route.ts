import { campaignCtx, json } from "@/lib/campaigns/api";
import { listSpecRequests } from "@/lib/campaigns/spec-requests";

/**
 * GET /api/specification-requests: open campaign specification requests (key or session), for an
 * outside agent to answer through POST /api/campaigns/:slug/specify (docs/api.md).
 */
export async function GET(request: Request) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  return json({ ok: true, items: await listSpecRequests(a.ctx.tenantId) });
}
