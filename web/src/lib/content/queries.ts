import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getApprovalRule, getContentReviewers } from "./reviewers";
import { STALE_REVIEW_MS } from "./types";

/**
 * Read models for the review UI (inbox, review page, library, badge). Every
 * query is tenant-scoped. Nothing here writes.
 */

export { STALE_REVIEW_MS };

export interface InboxRow {
  id: number;
  title: string;
  category: string;
  format: string | null;
  purpose: string | null;
  status: string;
  campaign: { id: number; name: string } | null;
  versionNumber: number | null;
  /** When the current version was created — "waiting since". */
  waitingSince: string | null;
  overdue: boolean;
  needsHumanAsset: boolean;
  /** §6c: open ⚠ questions (blocks live) and whether it may be hard-deleted. */
  openChecks: number;
  wasLive: boolean;
  /** Submitting agent's own confidence on the current version (display only). */
  selfScore: number | null;
  /** Verdict per configured reviewer on the current version. */
  verdicts: { reviewerId: number; reviewerName: string; verdict: string | null }[];
  hasLive: boolean;
}

export interface InboxSections {
  /** True when more rows exist past this page. */
  hasMore: boolean;
  page: number;
  mine: InboxRow[];
  otherReviewer: InboxRow[];
  aiWorking: InboxRow[];
  changesRequested: InboxRow[];
  live: InboxRow[];
  reviewers: { id: number; name: string }[];
  isReviewer: boolean;
}

/** Page size for every content list (performance golden rule §6c). */
export const PAGE_SIZE = 50;

export interface InboxFilter {
  category?: string;
  campaignId?: number;
  format?: string;
  status?: string;
  /** 1-based page over the *pipeline* rows (live has its own page). */
  page?: number;
}

const ROW_SELECT = {
  id: true, title: true, category: true, format: true, purpose: true, status: true,
  needsHumanAsset: true, liveVersionId: true, wasLive: true,
  campaign: { select: { id: true, name: true } },
  _count: { select: { checks: { where: { state: "open" } } } },
  currentVersion: {
    select: {
      number: true, createdAt: true, selfScore: true,
      reviews: { select: { reviewerUserId: true, verdict: true } },
    },
  },
} satisfies Prisma.ContentItemSelect;
type Row = Prisma.ContentItemGetPayload<{ select: typeof ROW_SELECT }>;

function toRow(r: Row, reviewers: { id: number; name: string }[], now: number): InboxRow {
  const reviews = r.currentVersion?.reviews ?? [];
  const since = r.currentVersion?.createdAt ?? null;
  return {
    id: r.id, title: r.title, category: r.category, format: r.format, purpose: r.purpose, status: r.status,
    campaign: r.campaign,
    versionNumber: r.currentVersion?.number ?? null,
    waitingSince: since?.toISOString() ?? null,
    overdue: r.status === "in_review" && since !== null && now - since.getTime() > STALE_REVIEW_MS,
    needsHumanAsset: r.needsHumanAsset,
    openChecks: r._count.checks,
    selfScore: r.currentVersion?.selfScore ?? null,
    wasLive: r.wasLive,
    verdicts: reviewers.map((u) => ({
      reviewerId: u.id, reviewerName: u.name,
      verdict: reviews.find((x) => x.reviewerUserId === u.id)?.verdict ?? null,
    })),
    hasLive: r.liveVersionId !== null,
  };
}

async function reviewerNames(tenantId: number): Promise<{ id: number; name: string }[]> {
  const ids = await getContentReviewers(tenantId);
  if (ids.length === 0) return [];
  const users = await db.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } });
  return ids.map((id) => users.find((u) => u.id === id)).filter((u): u is { id: number; name: string } => Boolean(u));
}

export async function getInbox(tenantId: number, userId: number, filter: InboxFilter = {}): Promise<InboxSections> {
  const reviewers = await reviewerNames(tenantId);
  const where: Prisma.ContentItemWhereInput = {
    tenantId,
    status: filter.status ? filter.status : { not: "archived" },
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.format ? { format: filter.format } : {}),
    ...(filter.campaignId ? { campaignId: filter.campaignId } : {}),
  };
  // Paginated, PAGE_SIZE per page: the pipeline rows and the live rows are two
  // pages, so a long live list can never push the work-in-progress off the page.
  const page = Math.max(1, filter.page ?? 1);
  const skip = (page - 1) * PAGE_SIZE;
  const [rows, liveRows] = await Promise.all([
    db.contentItem.findMany({
      where: filter.status ? where : { ...where, status: { notIn: ["archived", "live"] } },
      select: ROW_SELECT, orderBy: { updatedAt: "desc" }, skip, take: PAGE_SIZE + 1,
    }),
    filter.status && filter.status !== "live"
      ? Promise.resolve([])
      : // The live section is a preview only (browse them on /marketing/live), so
        // it is not paged with the pipeline rows.
        db.contentItem.findMany({
          where: { ...where, status: "live" }, select: ROW_SELECT, orderBy: { updatedAt: "desc" },
          take: PAGE_SIZE,
        }),
  ]);
  const hasMore = rows.length > PAGE_SIZE;
  const now = Date.now();
  const seen = new Set<number>();
  const all = [...rows.slice(0, PAGE_SIZE), ...liveRows].filter((r) => !seen.has(r.id) && seen.add(r.id)).map((r) => toRow(r, reviewers, now));
  const isReviewer = reviewers.some((r) => r.id === userId);
  const myVerdict = (r: InboxRow) => r.verdicts.find((v) => v.reviewerId === userId)?.verdict ?? null;
  const oldestFirst = (a: InboxRow, b: InboxRow) => (a.waitingSince ?? "").localeCompare(b.waitingSince ?? "");

  const inReview = all.filter((r) => r.status === "in_review" || r.status === "draft");
  return {
    mine: isReviewer ? inReview.filter((r) => myVerdict(r) === null).sort(oldestFirst) : [],
    otherReviewer: inReview.filter((r) => !isReviewer || myVerdict(r) !== null).sort(oldestFirst),
    aiWorking: all.filter((r) => r.status === "ai_working"),
    changesRequested: all.filter((r) => r.status === "changes_requested" || r.status === "rewrite_requested"),
    live: all.filter((r) => r.status === "live"),
    reviewers,
    isReviewer,
    hasMore,
    page,
  };
}

/** The `where` for content items still awaiting this reviewer's verdict. Shared
 * by countPendingForReviewer (badge/tile) and sendContentDigests (digest email). */
export function pendingForReviewerWhere(tenantId: number, userId: number): Prisma.ContentItemWhereInput {
  return {
    tenantId,
    status: { in: ["in_review", "draft"] },
    currentVersion: { reviews: { none: { reviewerUserId: userId } } },
  };
}

/** Nav badge + dashboard tile: current versions I have not judged yet. */
export async function countPendingForReviewer(tenantId: number, userId: number): Promise<number> {
  const reviewers = await getContentReviewers(tenantId);
  if (!reviewers.includes(userId)) return 0;
  return db.contentItem.count({ where: pendingForReviewerWhere(tenantId, userId) });
}

export interface ReviewPageData {
  item: {
    id: number; title: string; category: string; format: string | null; purpose: string | null;
    channel: string; status: string; internal: boolean; externalRef: string | null;
    needsHumanAsset: boolean; externalUrl: string | null; publishedAt: string | null; wasLive: boolean;
    campaign: { id: number; name: string } | null;
    currentVersionId: number | null; liveVersionId: number | null;
    claimedBy: string | null;
    metrics: Record<string, number> | null;
  };
  versions: {
    id: number; number: number; body: string; authorType: string; authorName: string | null;
    authorApp: string | null; changeNote: string | null; basedOnVersionId: number | null; createdAt: string;
    selfScore: number | null; selfNote: string | null;
    reviews: { reviewerId: number; reviewerName: string; verdict: string; comment: string | null; at: string }[];
    assets: { id: number; kind: string; url: string; storagePath: string | null; mimeType: string | null; caption: string | null; sizeBytes: number | null }[];
  }[];
  reviewers: { id: number; name: string }[];
  isReviewer: boolean;
  /** How many approvals this item's category needs, and whether that is possible. */
  approvals: { required: number; enoughReviewers: boolean; approved: number };
  /** §6c: ⚠ questions; an open one blocks going live. */
  checks: {
    id: number; question: string; forWhom: string; state: string; answer: string | null;
    resolvedBy: string | null; source: string; createdAt: string;
  }[];
}

export async function getReviewPage(tenantId: number, itemId: number, userId: number): Promise<ReviewPageData | null> {
  const item = await db.contentItem.findFirst({
    where: { id: itemId, tenantId },
    select: {
      id: true, title: true, category: true, format: true, purpose: true, channel: true, status: true,
      internal: true, externalRef: true, needsHumanAsset: true, externalUrl: true, publishedAt: true,
      currentVersionId: true, liveVersionId: true, claimedBy: true, metrics: true, wasLive: true,
      campaign: { select: { id: true, name: true } },
      checks: {
        orderBy: [{ state: "asc" }, { id: "asc" }],
        select: {
          id: true, question: true, forWhom: true, state: true, answer: true, source: true, createdAt: true,
          resolvedBy: { select: { name: true } },
        },
      },
      versions: {
        orderBy: { number: "desc" },
        select: {
          id: true, number: true, body: true, authorType: true, authorApp: true, changeNote: true,
          basedOnVersionId: true, createdAt: true, selfScore: true, selfNote: true,
          authorUser: { select: { name: true } },
          reviews: {
            orderBy: { updatedAt: "asc" },
            select: { reviewerUserId: true, verdict: true, comment: true, updatedAt: true, reviewer: { select: { name: true } } },
          },
          assets: {
            orderBy: { position: "asc" },
            select: { id: true, kind: true, url: true, storagePath: true, mimeType: true, caption: true, sizeBytes: true },
          },
        },
      },
    },
  });
  if (!item) return null;
  const reviewers = await reviewerNames(tenantId);
  const rule = await getApprovalRule(tenantId, item.category);
  const currentVersion = item.versions.find((v) => v.id === item.currentVersionId);
  const approved = (currentVersion?.reviews ?? []).filter(
    (r) => r.verdict === "approve" && rule.reviewers.includes(r.reviewerUserId),
  ).length;
  const { versions, publishedAt, checks, ...rest } = item;
  return {
    item: {
      ...rest,
      publishedAt: publishedAt?.toISOString() ?? null,
      metrics: rest.metrics as Record<string, number> | null,
    },
    checks: checks.map((c) => ({
      id: c.id, question: c.question, forWhom: c.forWhom, state: c.state, answer: c.answer,
      resolvedBy: c.resolvedBy?.name ?? null, source: c.source, createdAt: c.createdAt.toISOString(),
    })),
    versions: versions.map((v) => ({
      id: v.id, number: v.number, body: v.body, authorType: v.authorType,
      authorName: v.authorUser?.name ?? null, authorApp: v.authorApp, changeNote: v.changeNote,
      basedOnVersionId: v.basedOnVersionId, createdAt: v.createdAt.toISOString(),
      selfScore: v.selfScore ?? null, selfNote: v.selfNote ?? null,
      reviews: v.reviews.map((r) => ({
        reviewerId: r.reviewerUserId, reviewerName: r.reviewer.name, verdict: r.verdict,
        comment: r.comment, at: r.updatedAt.toISOString(),
      })),
      assets: v.assets,
    })),
    reviewers,
    isReviewer: reviewers.some((r) => r.id === userId),
    approvals: { required: rule.required, enoughReviewers: rule.enoughReviewers, approved },
  };
}

export interface LibraryRow {
  id: number; title: string; category: string; format: string | null; purpose: string | null;
  campaign: { id: number; name: string } | null;
  versionNumber: number; body: string;
  assets: { id: number; kind: string; url: string; storagePath: string | null; mimeType: string | null; caption: string | null }[];
  /** Consumers that reference this item (filled by PR (e); outreach drafts today). */
  usedBy: string[];
}

/** "Élő anyagok": only the dual-approved version of each item. */
export async function getLibrary(tenantId: number, filter: InboxFilter = {}): Promise<{ rows: LibraryRow[]; hasMore: boolean; page: number }> {
  const page = Math.max(1, filter.page ?? 1);
  const rows = await db.contentItem.findMany({
    where: {
      tenantId,
      liveVersionId: { not: null },
      status: { not: "archived" },
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.format ? { format: filter.format } : {}),
      ...(filter.campaignId ? { campaignId: filter.campaignId } : {}),
    },
    orderBy: [{ category: "asc" }, { title: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: {
      id: true, title: true, category: true, format: true, purpose: true,
      campaign: { select: { id: true, name: true } },
      liveVersion: {
        select: {
          number: true, body: true,
          assets: {
            orderBy: { position: "asc" },
            select: { id: true, kind: true, url: true, storagePath: true, mimeType: true, caption: true },
          },
        },
      },
    },
  });
  return {
    page,
    hasMore: rows.length > PAGE_SIZE,
    rows: rows
      .slice(0, PAGE_SIZE)
      .filter((r) => r.liveVersion)
      .map((r) => ({
        id: r.id, title: r.title, category: r.category, format: r.format, purpose: r.purpose,
        campaign: r.campaign, versionNumber: r.liveVersion!.number, body: r.liveVersion!.body,
        assets: r.liveVersion!.assets, usedBy: [],
      })),
  };
}

export async function getFilterOptions(tenantId: number) {
  const [campaigns, formats] = await Promise.all([
    db.campaign.findMany({ where: { tenantId, isArchived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.contentItem.findMany({
      where: { tenantId, format: { not: null } }, distinct: ["format"], select: { format: true },
    }),
  ]);
  return { campaigns, formats: formats.map((f) => f.format!).sort() };
}
