// Campaigns hub reads for the pages (server only). Every query is scoped by tenantId; the
// callers are pages under the (app) layout, which already refuses a non-CRM user.

import { specRequestTags } from "./spec-requests";
import { db } from "@/lib/db";
import { resolveDemoHost } from "@/lib/booking/queries";
import { addDays, atLocal, localDay } from "@/lib/booking/time";
import { campaignAnalytics } from "./analytics";
import { approvalHash, type StepDef } from "./rules";
import { dailyList, getCampaign, listCampaigns, OPERATOR_ROLES } from "./service";

/** Monday 00:00 Budapest of the week `now` is in. */
export function weekStart(now: Date): Date {
  const today = localDay(now);
  return atLocal(addDays(today, -((today.dow + 6) % 7)), 0);
}

export interface HubRow {
  id: number; slug: string; name: string; kind: string | null; status: string;
  owner: string | null; audience: number; queued: number; today: number | null;
  leadsThisWeek: number; assetsInReview: number; stepCount: number;
}

export async function hubList(tenantId: number, now: Date = new Date()) {
  const rows = await listCampaigns(tenantId);
  const slugs = rows.map((r) => r.slug);
  const ids = rows.map((r) => r.id);
  const [users, leads, review] = await Promise.all([
    db.user.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    db.lead.groupBy({ by: ["campaign"], where: { tenantId, campaign: { in: slugs }, createdAt: { gte: weekStart(now) } }, _count: { _all: true } }),
    db.contentItem.groupBy({ by: ["campaignId"], where: { tenantId, campaignId: { in: ids }, status: "in_review" }, _count: { _all: true } }),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const today = new Map<number, number>();
  const callers = rows.filter((x) => x.status === "running" && x.steps.some((s) => s.channel === "call"));
  const lists = await Promise.all(callers.map((r) => dailyList(tenantId, r.slug, now)));
  callers.forEach((r, i) => { const l = lists[i]; if (!("error" in l)) today.set(r.id, l.items.length); });
  const out: HubRow[] = rows.map((r) => {
    const m = r.members as Record<string, number>;
    return {
      id: r.id, slug: r.slug, name: r.name, kind: r.kind, status: r.status,
      owner: r.ownerUserId != null ? userName.get(r.ownerUserId) ?? null : null,
      audience: Object.values(m).reduce((a, b) => a + b, 0), queued: m.queued ?? 0,
      today: today.get(r.id) ?? null,
      leadsThisWeek: leads.find((x) => x.campaign === r.slug)?._count._all ?? 0,
      assetsInReview: review.find((x) => x.campaignId === r.id)?._count._all ?? 0,
      stepCount: r.steps.length,
    };
  });
  return { rows: out, summary: summarize(out) };
}

export function summarize(rows: readonly HubRow[]) {
  return {
    running: rows.filter((r) => r.status === "running").length,
    // A draft Áron could approve now: it has steps and a queued member.
    awaiting: rows.filter((r) => (r.status === "draft" || r.status === "paused") && r.stepCount > 0 && r.queued > 0).length,
    callsToday: rows.reduce((a, r) => a + (r.today ?? 0), 0),
    leadsThisWeek: rows.reduce((a, r) => a + r.leadsThisWeek, 0),
    assetsInReview: rows.reduce((a, r) => a + r.assetsInReview, 0),
  };
}

/** Each load (import_batch) of a campaign with how many of its members were touched; untouched batches can be undone. */
export async function memberBatches(tenantId: number, campaignId: number) {
  const [batches, touched] = await Promise.all([
    db.campaignMember.groupBy({ by: ["importBatch"], where: { tenantId, campaignId }, _count: { _all: true }, _min: { createdAt: true } }),
    db.campaignMember.groupBy({
      by: ["importBatch"],
      where: { tenantId, campaignId, OR: [{ attempts: { gt: 0 } }, { lastTouchedAt: { not: null } }, { leadId: { not: null } }] },
      _count: { _all: true },
    }),
  ]);
  return batches.filter((b) => b.importBatch != null).sort((a, b) => (b._min.createdAt?.getTime() ?? 0) - (a._min.createdAt?.getTime() ?? 0)).map((b) => ({
    batch: b.importBatch!, members: b._count._all, createdAt: b._min.createdAt,
    touched: touched.find((t) => t.importBatch === b.importBatch)?._count._all ?? 0,
  }));
}

export interface AssetState { id: number; title: string; status: string; version: number | null }

/** Everything the campaign page shows; null when the slug is not in the tenant. */
export async function campaignPage(tenantId: number, slug: string, userId: number) {
  const c = await getCampaign(tenantId, slug);
  if (!c) return null;
  const proposal = (c.briefProposal ?? null) as { brief?: Record<string, unknown> | null; steps?: { channel: string; wait_days?: number }[] | null; assets?: { item_id: number; step_position: number | null }[]; note?: string | null; proposed_by?: string; proposed_at?: string } | null;
  const assetIds = [...new Set([
    ...c.steps.map((s) => s.contentItemId).filter((v): v is number => v != null),
    ...(proposal?.assets ?? []).map((a) => a.item_id),
  ])];
  const [items, counts, batches, me, aron, stats, owner, memberIds, openSpec] = await Promise.all([
    db.contentItem.findMany({
      where: { tenantId, OR: [{ id: { in: assetIds } }, { campaignId: c.id }] },
      select: { id: true, title: true, status: true, metrics: true, publishedAt: true, currentVersion: { select: { number: true } } },
      orderBy: { id: "asc" },
    }),
    db.campaignMember.groupBy({ by: ["state"], where: { tenantId, campaignId: c.id }, _count: { _all: true } }),
    memberBatches(tenantId, c.id),
    db.user.findFirst({ where: { tenantId, id: userId }, select: { role: true } }),
    resolveDemoHost(tenantId, "aron"),
    campaignAnalytics(tenantId, { slug }),
    c.ownerUserId != null ? db.user.findFirst({ where: { tenantId, id: c.ownerUserId }, select: { name: true } }) : null,
    db.campaignMember.findMany({ where: { tenantId, campaignId: c.id }, select: { companyId: true } }),
    db.task.findFirst({ where: { tenantId, status: { in: ["created", "in_progress"] }, setMembership: { hasEvery: specRequestTags(slug) } }, select: { id: true } }),
  ]);
  // What Áron sees is what launches: the approve action sends this hash back and the service 409s on any change.
  const previewHash = approvalHash({
    memberCompanyIds: memberIds.map((m) => m.companyId),
    steps: c.steps as (StepDef & { contentItemId: number | null })[],
    dailyCap: c.dailyCap, outboundAutomations: c.outboundAutomations,
  });
  const assets: AssetState[] = items.map((i) => ({ id: i.id, title: i.title, status: i.status, version: i.currentVersion?.number ?? null }));
  return {
    campaign: c,
    owner: owner?.name ?? null,
    proposal,
    assets,
    openSpecRequest: openSpec != null,
    metrics: items.map((i) => ({ id: i.id, title: i.title, published: i.publishedAt != null, metrics: (i.metrics ?? null) as Record<string, number> | null })),
    members: Object.fromEntries(counts.map((x) => [x.state, x._count._all])) as Record<string, number>,
    batches,
    stats: stats[0]?.stats ?? null,
    previewHash,
    isAron: aron != null && aron === userId,
    canOperate: me != null && OPERATOR_ROLES.includes(me.role),
  };
}
