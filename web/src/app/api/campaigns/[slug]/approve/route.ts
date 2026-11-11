import { campaignCtx, failRes, json, slugParam } from "@/lib/campaigns/api";
import { approveCampaign } from "@/lib/campaigns/service";

type P = { params: Promise<{ slug: string }> };

/** POST /api/campaigns/:slug/approve (session only, Áron only): approve and launch. Stores the hash of members, steps and cap. */
export async function POST(request: Request, { params }: P) {
  const a = await campaignCtx(request, { sessionOnly: true });
  if ("res" in a) return a.res;
  const slug = slugParam.safeParse((await params).slug);
  if (!slug.success) return json({ error: "Invalid slug" }, 400);
  // Optional body { expect: { hash } }: the approval hash of what the approver saw; a mismatch is
  // 409, a malformed expect is 400, never silently ignored.
  const raw = await request.json().catch(() => null) as { expect?: { hash?: unknown } } | null;
  if (raw?.expect !== undefined && !(typeof raw.expect?.hash === "string" && /^[0-9a-f]{64}$/.test(raw.expect.hash))) {
    return json({ error: "expect.hash must be a 64-character hex approval hash" }, 400);
  }
  const r = await approveCampaign(a.ctx, slug.data, raw?.expect ? { hash: raw.expect.hash as string } : undefined);
  return "error" in r ? failRes(r) : json(r);
}
