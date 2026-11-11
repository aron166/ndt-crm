import { z } from "zod";
import { body, campaignCtx, failRes, json, slugParam } from "@/lib/campaigns/api";
import { loadLeadAudience } from "@/lib/campaigns/service";

type P = { params: Promise<{ slug: string }> };
const schema = z.object({ dry_run: z.boolean().default(true), batch: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/) });

/**
 * POST /api/campaigns/:slug/lead-audience: load the open leads in the campaign's chosen stages as
 * members (item 4). dry_run defaults to TRUE (key or session); applying is session only, admin or manager.
 */
export async function POST(request: Request, { params }: P) {
  const a = await campaignCtx(request);
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  const b = await body(request, schema);
  if ("res" in b) return b.res;
  const r = await loadLeadAudience(a.ctx, slug.data, b.data);
  return "error" in r ? failRes(r) : json(r, b.data.dry_run ? 200 : 201);
}
