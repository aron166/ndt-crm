import { campaignCtx, failRes, json, slugParam } from "@/lib/campaigns/api";
import { approveCampaign } from "@/lib/campaigns/service";

type P = { params: Promise<{ slug: string }> };

/** POST /api/campaigns/:slug/approve (session only, Áron only): approve and launch. Stores the hash of members, steps and cap. */
export async function POST(request: Request, { params }: P) {
  const a = await campaignCtx(request, { sessionOnly: true });
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  // Optional body { expect: { members, steps, daily_cap } }: what the approver saw; a mismatch is 409.
  const raw = await request.json().catch(() => null) as { expect?: { members?: unknown; steps?: unknown; daily_cap?: unknown } } | null;
  const e = raw?.expect;
  const n = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null);
  const expect = e && n(e.members) != null && n(e.steps) != null && n(e.daily_cap) != null
    ? { members: n(e.members)!, steps: n(e.steps)!, dailyCap: n(e.daily_cap)! } : undefined;
  const r = await approveCampaign(a.ctx, slug.data, expect);
  return "error" in r ? failRes(r) : json(r);
}
