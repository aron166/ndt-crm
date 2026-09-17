import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getContentReviewers } from "./reviewers";

/**
 * Read models for the review UI (inbox, review page, library, badge). Every
 * query is tenant-scoped. Nothing here writes.
 */

/** Waiting longer than this on a reviewer is highlighted (spec §5). */
export const STALE_REVIEW_MS = 3 * 24 * 60 * 60 * 1000;

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
  /** Verdict per configured reviewer on the current version. */
  verdicts: { reviewerId: number; reviewerName: string; verdict: string | null }[];
  hasLive: boolean;
}

export interface InboxSections {
  mine: InboxRow[];
  otherReviewer: InboxRow[];
  aiWorking: InboxRow[];
  changesRequested: InboxRow[];
  live: InboxRow[];
  reviewers: { id: number; name: string }[];
  isReviewer: boolean;
}

export interface InboxFilter {
  category?: string;
  campaignId?: number;
  format?: string;
  status?: string;
}

const ROW_SELECT = {
  id: true, title: true, category: true, format: true, purpose: true, status: true,
  needsHumanAsset: true, liveVersionId: true,
  campaign: { select: { id: true, name: true } },
  currentVersion: {
    select: {
      number: true, createdAt: true,
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
  const rows = await db.contentItem.findMany({
    where, select: ROW_SELECT, orderBy: { updatedAt: "asc" }, take: 500,
  });
  const now = Date.now();
  const all = rows.map((r) => toRow(r, reviewers, now));
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
  };
}

/** Nav badge + dashboard tile: current versions I have not judged yet. */
export async function countPendingForReviewer(tenantId: number, userId: number): Promise<number> {
  const reviewers = await getContentReviewers(tenantId);
  if (!reviewers.includes(userId)) return 0;
  return db.contentItem.count({
    where: {
      tenantId,
      status: { in: ["in_review", "draft"] },
      currentVersion: { reviews: { none: { reviewerUserId: userId } } },
    },
  });
}

export interface ReviewPageData {
  item: {
    id: number; title: string; category: string; format: string | null; purpose: string | null;
    channel: string; status: string; internal: boolean; externalRef: string | null;
    needsHumanAsset: boolean; externalUrl: string | null; publishedAt: string | null;
    campaign: { id: number; name: string } | null;
    currentVersionId: number | null; liveVersionId: number | null;
    claimedBy: string | null;
  };
  versions: {
    id: number; number: number; body: string; authorType: string; authorName: string | null;
    authorApp: string | null; changeNote: string | null; basedOnVersionId: number | null; createdAt: string;
    reviews: { reviewerId: number; reviewerName: string; verdict: string; comment: string | null; at: string }[];
    assets: { id: number; kind: string; url: string; storagePath: string | null; mimeType: string | null; caption: string | null; sizeBytes: number | null }[];
  }[];
  reviewers: { id: number; name: string }[];
  isReviewer: boolean;
}

export async function getReviewPage(tenantId: number, itemId: number, userId: number): Promise<ReviewPageData | null> {
  const item = await db.contentItem.findFirst({
    where: { id: itemId, tenantId },
    select: {
      id: true, title: true, category: true, format: true, purpose: true, channel: true, status: true,
      internal: true, externalRef: true, needsHumanAsset: true, externalUrl: true, publishedAt: true,
      currentVersionId: true, liveVersionId: true, claimedBy: true,
      campaign: { select: { id: true, name: true } },
      versions: {
        orderBy: { number: "desc" },
        select: {
          id: true, number: true, body: true, authorType: true, authorApp: true, changeNote: true,
          basedOnVersionId: true, createdAt: true,
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
  const { versions, publishedAt, ...rest } = item;
  return {
    item: { ...rest, publishedAt: publishedAt?.toISOString() ?? null },
    versions: versions.map((v) => ({
      id: v.id, number: v.number, body: v.body, authorType: v.authorType,
      authorName: v.authorUser?.name ?? null, authorApp: v.authorApp, changeNote: v.changeNote,
      basedOnVersionId: v.basedOnVersionId, createdAt: v.createdAt.toISOString(),
      reviews: v.reviews.map((r) => ({
        reviewerId: r.reviewerUserId, reviewerName: r.reviewer.name, verdict: r.verdict,
        comment: r.comment, at: r.updatedAt.toISOString(),
      })),
      assets: v.assets,
    })),
    reviewers,
    isReviewer: reviewers.some((r) => r.id === userId),
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
export async function getLibrary(tenantId: number, filter: InboxFilter = {}): Promise<LibraryRow[]> {
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
  return rows
    .filter((r) => r.liveVersion)
    .map((r) => ({
      id: r.id, title: r.title, category: r.category, format: r.format, purpose: r.purpose,
      campaign: r.campaign, versionNumber: r.liveVersion!.number, body: r.liveVersion!.body,
      assets: r.liveVersion!.assets, usedBy: [],
    }));
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
