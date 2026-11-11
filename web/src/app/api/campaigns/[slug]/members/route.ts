import { body, campaignCtx, failRes, json, slugParam } from "@/lib/campaigns/api";
import { addMembersSchema } from "@/lib/campaigns/members";
import { addMembers, getCampaign, undoBatch } from "@/lib/campaigns/service";
import { memberBatches } from "@/lib/campaigns/hub";

type P = { params: Promise<{ slug: string }> };

/** GET /api/campaigns/:slug/members (app key or session): the loads (batches) with member and touched counts. */
export async function GET(request: Request, { params }: P) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const c = await getCampaign(a.ctx.tenantId, slug.data);
  if (!c) return json({ error: "Kampány nem található" }, 404);
  return json({ batches: await memberBatches(a.ctx.tenantId, c.id) });
}

/**
 * POST /api/campaigns/:slug/members. dry_run defaults to TRUE (app key or session): the
 * response is the plan (matched, created, skipped and why). dry_run false writes it: session only,
 * admin or manager (an app key gets 403, service addMembers). On a
 * running campaign a write sends it back to draft (a new approval).
 */
export async function POST(request: Request, { params }: P) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const b = await body(request, addMembersSchema);
  if ("res" in b) return b.res;
  const r = await addMembers(a.ctx, slug.data, b.data);
  return "error" in r ? failRes(r) : json(r, b.data.dry_run ? 200 : 201);
}

/** DELETE /api/campaigns/:slug/members?batch=<id>&dry_run=0: undo one load. dry_run defaults to true (key or session); dry_run=0 is session only, admin or manager. */
export async function DELETE(request: Request, { params }: P) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const q = new URL(request.url).searchParams;
  const batch = q.get("batch") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(batch)) return json({ error: "batch is required" }, 400);
  const r = await undoBatch(a.ctx, slug.data, batch, q.get("dry_run") !== "0");
  return "error" in r ? failRes(r) : json(r);
}
