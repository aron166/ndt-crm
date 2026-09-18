import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { applyEvent, isClaimStale, type ItemState } from "./transitions";
import { getApprovalRule, getContentReviewers } from "./reviewers";
import { runContentRules } from "./rules";
import { isReviewReason, reasonRequiredFor, type ReviewReason } from "./reasons";
import { MAX_STEP } from "@/lib/outreach/drafts";
import {
  CLAIM_TTL_MS, CONTENT_BODY_MAX, CHANGE_NOTE_MAX, REVIEW_COMMENT_MAX,
  isContentStatus, type ContentCategory, type ContentStatus, type Verdict,
} from "./types";

/**
 * The ONE write path for the content approval pipeline (spec 2026-09-17).
 * Server actions (humans) and the app-key API (the content-revise skill) both
 * call this; every status change goes through lib/content/transitions.ts.
 *
 * Invariants enforced here:
 *  - versions are immutable; any edit is a new version;
 *  - only configured reviewers write reviews, only for themselves, only on the
 *    CURRENT version;
 *  - app actors can never write a review or set live;
 *  - an app version needs a live claim by that app, a change note, and must be
 *    based on the current version — a human edit after the claim makes it 409;
 *  - every version, verdict and live switch writes audit_log in the same
 *    transaction, under a row lock on the item.
 */

export type ContentActor =
  | { tenantId: number; kind: "user"; userId: number }
  | { tenantId: number; kind: "app"; appSlug: string };
export type UserActor = Extract<ContentActor, { kind: "user" }>;
export type AppActor = Extract<ContentActor, { kind: "app" }>;

export type Fail = { ok: false; status: 400 | 403 | 404 | 409; error: string };
const fail = (status: Fail["status"], error: string): Fail => ({ ok: false, status, error });

type Tx = Prisma.TransactionClient;

const STATE_SELECT = {
  id: true, status: true, currentVersionId: true, liveVersionId: true,
  claimedAt: true, claimedFrom: true, claimedBy: true, prevStatus: true, wasLive: true, category: true,
  source: true, externalRef: true,
} satisfies Prisma.ContentItemSelect;
type StateRow = Prisma.ContentItemGetPayload<{ select: typeof STATE_SELECT }>;

function stateOf(row: StateRow): ItemState {
  return {
    status: isContentStatus(row.status) ? row.status : "draft",
    currentVersionId: row.currentVersionId,
    liveVersionId: row.liveVersionId,
    claimedAt: row.claimedAt,
    claimedFrom: isContentStatus(row.claimedFrom) ? row.claimedFrom : null,
  };
}

/** Lock the item row for the rest of the transaction, then read its state. */
async function lockItem(tx: Tx, tenantId: number, itemId: number): Promise<StateRow | null> {
  await tx.$queryRaw`SELECT id FROM content_items WHERE id = ${itemId} AND tenant_id = ${tenantId} FOR UPDATE`;
  return tx.contentItem.findFirst({ where: { id: itemId, tenantId }, select: STATE_SELECT });
}

function actorInfo(actor: ContentActor) {
  return actor.kind === "user" ? { userId: actor.userId } : { app: actor.appSlug };
}

async function writeAudit(
  tx: Tx, actor: ContentActor,
  entityType: "content_item" | "content_version" | "content_review",
  entityId: number, action: "create" | "update" | "delete",
  before: Record<string, unknown> | null, after: Record<string, unknown> | null,
) {
  await tx.auditLog.create({
    data: {
      tenantId: actor.tenantId,
      actorUserId: null, // Supabase UUID column; the CRM user id is in `changes.by`
      actorAgentId: actor.kind === "app" ? actor.appSlug : null,
      action, entityType, entityId,
      changes: { before, after, by: actorInfo(actor) } as Prisma.InputJsonValue,
    },
  });
}

function authorFields(actor: ContentActor, importing = false) {
  return actor.kind === "user"
    ? { authorType: "user", authorUserId: actor.userId, authorApp: null }
    : { authorType: importing ? "import" : "ai", authorUserId: null, authorApp: actor.appSlug };
}

// ── Create ──────────────────────────────────────────────────────────────────

export interface CreateItemInput {
  title: string;
  body: string;
  category: ContentCategory;
  channel: string;
  contentType: string;
  format?: string | null;
  purpose?: string | null;
  campaignId?: number | null;
  /** The company this piece is for (its dossier feeds the rewrite loop). */
  companyId?: number | null;
  externalRef?: string | null;
  changeNote?: string | null;
  internal?: boolean;
  source: string;
  sourceMeta?: Prisma.InputJsonValue;
  scheduledFor?: Date | null;
  /** App-key imports of existing material are `import`, not `ai`. */
  importing?: boolean;
  /** Submitting agent's own confidence 0..1 and a short note (display only). */
  selfScore?: number | null;
  selfNote?: string | null;
}

/**
 * New item with version 1, straight into review. Idempotent on externalRef:
 * an existing item with the same ref is returned untouched (`existed: true`).
 */
export async function createItem(
  actor: ContentActor,
  input: CreateItemInput,
  tx?: Tx,
): Promise<{ ok: true; itemId: number; versionId: number | null; existed: boolean } | Fail> {
  if (!input.body.trim() || input.body.length > CONTENT_BODY_MAX) return fail(400, "Invalid body");
  const run = async (t: Tx) => {
    if (input.externalRef) {
      const existing = await t.contentItem.findFirst({
        where: { tenantId: actor.tenantId, externalRef: input.externalRef },
        select: { id: true, currentVersionId: true },
      });
      if (existing) return { ok: true as const, itemId: existing.id, versionId: existing.currentVersionId, existed: true };
    }
    const item = await t.contentItem.create({
      data: {
        tenantId: actor.tenantId,
        campaignId: input.campaignId ?? null,
        companyId: input.companyId ?? null,
        channel: input.channel,
        contentType: input.contentType,
        category: input.category,
        format: input.format ?? null,
        purpose: input.purpose ?? null,
        externalRef: input.externalRef ?? null,
        title: input.title,
        body: input.body,
        status: "in_review",
        internal: input.internal ?? false,
        source: input.source,
        scheduledFor: input.scheduledFor ?? null,
        ...(input.sourceMeta !== undefined ? { sourceMeta: input.sourceMeta } : {}),
      },
      select: { id: true },
    });
    const version = await t.contentVersion.create({
      data: {
        tenantId: actor.tenantId, itemId: item.id, number: 1, body: input.body,
        changeNote: input.changeNote ?? null,
        selfScore: clampSelfScore(input.selfScore),
        selfNote: input.selfNote?.trim()?.slice(0, SELF_NOTE_MAX) ?? null,
        ...authorFields(actor, input.importing),
      },
      select: { id: true },
    });
    // Same context as every later version: an inline one left missing_footer and
    // duplicate_hook structurally dead on the submit path (Vanda, #104).
    const violations = await reconcileRuleChecks(t, actor.tenantId, item.id,
      await ruleContextFor(t, actor.tenantId,
        { id: item.id, category: input.category, format: input.format ?? null, campaignId: input.campaignId ?? null },
        input.body));
    await t.contentItem.update({
      where: { id: item.id },
      data: {
        currentVersionId: version.id,
        // A submission that already breaks a rule goes to the AI queue.
        ...(violations.length > 0 ? { status: "rewrite_requested" } : {}),
      },
    });
    await writeAudit(t, actor, "content_item", item.id, "create", null,
      {
        title: input.title, category: input.category,
        status: violations.length > 0 ? "rewrite_requested" : "in_review",
        ...(violations.length ? { ruleViolations: violations.map((v) => v.rule) } : {}),
        externalRef: input.externalRef ?? null,
      });
    await writeAudit(t, actor, "content_version", version.id, "create", null, { itemId: item.id, number: 1 });
    return { ok: true as const, itemId: item.id, versionId: version.id, existed: false };
  };
  try {
    return await (tx ? run(tx) : db.$transaction(run));
  } catch (err) {
    // Concurrent create with the same externalRef: the unique index wins; hand
    // back the item the other request created (only possible without an outer tx).
    if (!tx && input.externalRef && (err as { code?: string }).code === "P2002") {
      const existing = await db.contentItem.findFirst({
        where: { tenantId: actor.tenantId, externalRef: input.externalRef },
        select: { id: true, currentVersionId: true },
      });
      if (existing) return { ok: true, itemId: existing.id, versionId: existing.currentVersionId, existed: true };
    }
    throw err;
  }
}

export interface CreateVersionInput {
  body: string;
  changeNote?: string | null;
  basedOnVersionId: number;
  /** AI only: the change needs an image/video a human must produce. */
  needsHumanAsset?: boolean;
  /** Submitting agent's own confidence 0..1 and a short note (display only). */
  selfScore?: number | null;
  selfNote?: string | null;
  /**
   * Import refresh: the SOURCE FILE changed, so this version restates the
   * source rather than being an AI rewrite. It needs no claim (the importer is
   * not the rewrite loop) but every other rule still applies: stale base is a
   * 409, the content rules run, reviews reset. Ignored for user actors.
   */
  fromSource?: boolean;
  /**
   * The files of the new version. Omitted → the base version's files are
   * carried forward (always the case for AI versions, which cannot upload).
   * Given → exactly these (the caller has verified storage paths / tenancy).
   */
  assets?: NewAssetInput[];
}

export interface NewAssetInput {
  kind: string;
  url: string;
  storagePath?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  thumbPath?: string | null;
  caption?: string | null;
}

export async function createVersion(
  actor: ContentActor,
  itemId: number,
  input: CreateVersionInput,
): Promise<{ ok: true; versionId: number; number: number; violations: { rule: string; message: string }[] } | Fail> {
  if (!input.body.trim() || input.body.length > CONTENT_BODY_MAX) return fail(400, "Invalid body");
  const changeNote = input.changeNote?.trim() || null;
  if (changeNote && changeNote.length > CHANGE_NOTE_MAX) return fail(400, "Change note too long");
  if (actor.kind === "app" && !changeNote) return fail(400, "change_note is required");

  return db.$transaction(async (tx) => {
    const row = await lockItem(tx, actor.tenantId, itemId);
    if (!row) return fail(404, "Not found");
    const state = stateOf(row);
    if (state.status === "archived") return fail(409, "Archived");
    if (state.currentVersionId !== input.basedOnVersionId) {
      return fail(409, "Stale base: a newer version exists");
    }

    if (actor.kind === "app") {
      if (!input.fromSource) {
        if (state.status !== "ai_working" || row.claimedBy !== actor.appSlug || !row.claimedAt) {
          return fail(409, "Not claimed by this app");
        }
        if (isClaimStale(row.claimedAt, new Date())) return fail(409, "Claim expired");
      } else if (state.status === "ai_working") {
        // Never overwrite a rewrite the AI is in the middle of.
        return fail(409, "The AI is rewriting this item");
      } else if (row.source !== "import" && !row.externalRef) {
        // Refresh restates a SOURCE FILE. An item that came from a human in the
        // app has no source file, so there is nothing to refresh from, and an
        // app key must not overwrite a human's current version without a claim.
        return fail(409, "This item has no source file to refresh from");
      }
      // Race rule (spec §1): a human version since the claim wins, always.
      // Backstop: a human version already clears the claim, so the check above
      // normally fires first — kept deliberately in case that ever changes.
      if (row.claimedAt) {
        const humanSince = await tx.contentVersion.count({
          where: { itemId, authorType: "user", createdAt: { gt: row.claimedAt } },
        });
        if (humanSince > 0) return fail(409, "A human edited this item after the claim");
      }
    }

    const last = await tx.contentVersion.findFirst({
      where: { itemId }, orderBy: { number: "desc" }, select: { number: true },
    });
    const number = (last?.number ?? 0) + 1;
    const version = await tx.contentVersion.create({
      data: {
        tenantId: actor.tenantId, itemId, number, body: input.body, changeNote,
        basedOnVersionId: input.basedOnVersionId,
        selfScore: clampSelfScore(input.selfScore),
        selfNote: input.selfNote?.trim()?.slice(0, SELF_NOTE_MAX) ?? null,
        ...authorFields(actor, input.fromSource),
      },
      select: { id: true },
    });

    const assets: NewAssetInput[] = input.assets ?? (await tx.contentAsset.findMany({
      where: { tenantId: actor.tenantId, versionId: input.basedOnVersionId },
      orderBy: { position: "asc" },
      select: { kind: true, url: true, storagePath: true, thumbPath: true, mimeType: true, sizeBytes: true, caption: true },
    }));
    if (assets.length) {
      await tx.contentAsset.createMany({
        data: assets.map((a, i) => ({
          tenantId: actor.tenantId, contentItemId: itemId, versionId: version.id, position: i,
          kind: a.kind, url: a.url, storagePath: a.storagePath ?? null, thumbPath: a.thumbPath ?? null,
          mimeType: a.mimeType ?? null, sizeBytes: a.sizeBytes ?? null, caption: a.caption ?? null,
        })),
      });
    }

    const next = applyEvent(state, { type: "version_created", versionId: version.id });
    if (!next.ok) return fail(409, next.reason);

    // Hard checks: a violated version goes BACK TO THE AI QUEUE, not to a human,
    // and each violation is an open check so the live gate blocks it.
    const itemRow = await tx.contentItem.findFirst({
      where: { id: itemId, tenantId: actor.tenantId },
      select: { id: true, category: true, format: true, campaignId: true },
    });
    const violations = itemRow
      ? await reconcileRuleChecks(tx, actor.tenantId, itemId, await ruleContextFor(tx, actor.tenantId, itemRow, input.body))
      : [];
    const statusAfterRules = violations.length > 0 ? "rewrite_requested" : next.state.status;

    await tx.contentItem.update({
      where: { id: itemId },
      data: {
        status: statusAfterRules,
        currentVersionId: next.state.currentVersionId,
        claimedAt: null, claimedFrom: null, claimedBy: null,
        body: input.body,
        needsHumanAsset: actor.kind === "app" ? Boolean(input.needsHumanAsset) : false,
      },
    });
    await writeAudit(tx, actor, "content_version", version.id, "create",
      { itemId, status: state.status, currentVersionId: state.currentVersionId },
      {
        itemId, number, status: statusAfterRules, basedOnVersionId: input.basedOnVersionId,
        ...(violations.length ? { ruleViolations: violations.map((v) => v.rule) } : {}),
      });
    return { ok: true as const, versionId: version.id, number, violations };
  });
}

// ── Review ──────────────────────────────────────────────────────────────────

export async function submitReview(
  actor: UserActor,
  versionId: number,
  verdict: Verdict,
  rawComment?: string | null,
  reason?: string | null,
): Promise<{ ok: true; status: ContentStatus; wentLive: boolean } | Fail> {
  const reviewers = await getContentReviewers(actor.tenantId);
  if (!reviewers.includes(actor.userId)) return fail(403, "Nem vagy bíráló ennél a cégnél");
  const comment = rawComment?.trim() || null;
  if (verdict !== "approve" && (!comment || comment.length < 3)) {
    return fail(400, "Írd le, mit kell változtatni (legalább 3 karakter)");
  }
  if (comment && comment.length > REVIEW_COMMENT_MAX) return fail(400, "A megjegyzés túl hosszú");
  // A send-back needs a reason TAG as well as the prose (Áron, 2026-09-17).
  let reasonTag: ReviewReason | null = null;
  if (reasonRequiredFor(verdict)) {
    if (!isReviewReason(reason)) return fail(400, "Válaszd ki, miért küldöd vissza");
    reasonTag = reason;
  }

  return db.$transaction(async (tx) => {
    const version = await tx.contentVersion.findFirst({
      where: { id: versionId, tenantId: actor.tenantId }, select: { id: true, itemId: true, number: true },
    });
    if (!version) return fail(404, "Nem található");
    const row = await lockItem(tx, actor.tenantId, version.itemId);
    if (!row) return fail(404, "Nem található");
    if (row.currentVersionId !== version.id) {
      return fail(409, "Ez már nem az aktuális verzió: frissítsd az oldalt");
    }
    // Reject BEFORE writing anything: a returned fail() commits the transaction,
    // so a review saved first would persist without its audit row (Vanda, #99).
    let state = stateOf(row);
    const released = applyEvent(state, { type: "release_stale", now: new Date() });
    if (released.ok && released.state.status !== state.status) {
      await tx.contentItem.update({
        where: { id: row.id },
        data: { status: released.state.status, claimedAt: null, claimedFrom: null, claimedBy: null },
      });
      await writeAudit(tx, actor, "content_item", row.id, "update",
        { status: state.status, claimedBy: row.claimedBy }, { status: released.state.status, reason: "stale_claim" });
      state = released.state;
    }
    if (state.status === "archived") return fail(409, "Archivált anyag nem bírálható");
    if (state.status === "ai_working") return fail(409, "Az AI éppen átírja ezt az anyagot: várj, vagy szerkeszd te");

    const before = await tx.contentReview.findUnique({
      where: { versionId_reviewerUserId: { versionId, reviewerUserId: actor.userId } },
      select: { verdict: true, comment: true, reason: true },
    });
    const review = await tx.contentReview.upsert({
      where: { versionId_reviewerUserId: { versionId, reviewerUserId: actor.userId } },
      create: { tenantId: actor.tenantId, versionId, reviewerUserId: actor.userId, verdict, comment, reason: reasonTag },
      update: { verdict, comment, reason: reasonTag },
      select: { id: true },
    });
    const all = await tx.contentReview.findMany({
      where: { versionId }, select: { reviewerUserId: true, verdict: true },
    });

    // The check gate must be evaluated HERE too: two approvals must not make an
    // item live while a ⚠ check is open (Vanda, #103 finding 1).
    const openChecks = await tx.contentCheck.count({ where: { itemId: row.id, state: "open" } });
    // How many approvals THIS item needs (per-category setting, default 2).
    const rule = await getApprovalRule(actor.tenantId, row.category, tx);
    const next = applyEvent(state, {
      type: "reviews_changed",
      reviewers: rule.reviewers,
      reviews: all.map((r) => ({ reviewerUserId: r.reviewerUserId, verdict: r.verdict as Verdict })),
      openChecks,
      requiredApprovals: rule.required,
    });
    if (!next.ok) return fail(409, next.reason);

    await tx.contentItem.update({
      where: { id: row.id },
      data: {
        status: next.state.status,
        liveVersionId: next.state.liveVersionId,
        ...(next.wentLive ? { wasLive: true } : {}),
      },
    });
    await writeAudit(tx, actor, "content_review", review.id, before ? "update" : "create",
      before ? { verdict: before.verdict, comment: before.comment, reason: before.reason } : null,
      { itemId: row.id, versionId, versionNumber: version.number, verdict, reason: reasonTag, comment, itemStatus: next.state.status });
    if (next.wentLive) {
      await writeAudit(tx, actor, "content_item", row.id, "update",
        { status: state.status, liveVersionId: state.liveVersionId },
        { status: "live", liveVersionId: next.state.liveVersionId });
    }
    return { ok: true as const, status: next.state.status, wentLive: next.wentLive };
  });
}

// ── AI claim ────────────────────────────────────────────────────────────────

export async function claimItem(
  actor: AppActor,
  itemId: number,
  now: Date = new Date(),
): Promise<{ ok: true; alreadyClaimed: boolean } | Fail> {
  return db.$transaction(async (tx) => {
    const row = await lockItem(tx, actor.tenantId, itemId);
    if (!row) return fail(404, "Not found");
    const state = stateOf(row);
    // Idempotent for the same claimer while the claim is fresh.
    if (state.status === "ai_working" && row.claimedBy === actor.appSlug && !isClaimStale(row.claimedAt, now)) {
      return { ok: true as const, alreadyClaimed: true };
    }
    const next = applyEvent(state, { type: "claim", now });
    if (!next.ok) return fail(409, next.reason);
    await tx.contentItem.update({
      where: { id: itemId },
      data: { status: "ai_working", claimedAt: now, claimedFrom: next.state.claimedFrom, claimedBy: actor.appSlug },
    });
    await writeAudit(tx, actor, "content_item", itemId, "update",
      { status: state.status }, { status: "ai_working", claimedBy: actor.appSlug });
    return { ok: true as const, alreadyClaimed: false };
  });
}

/** Release AI claims older than CLAIM_TTL_MS. Returns how many were released. */
export async function releaseStaleClaims(tenantId: number, now: Date = new Date()): Promise<number> {
  const stale = await db.contentItem.findMany({
    where: { tenantId, status: "ai_working", claimedAt: { lt: new Date(now.getTime() - CLAIM_TTL_MS) } },
    select: { id: true },
  });
  let released = 0;
  for (const { id } of stale) {
    await db.$transaction(async (tx) => {
      const row = await lockItem(tx, tenantId, id);
      if (!row) return;
      const state = stateOf(row);
      const next = applyEvent(state, { type: "release_stale", now });
      if (!next.ok || next.state.status === state.status) return;
      await tx.contentItem.update({
        where: { id },
        data: { status: next.state.status, claimedAt: null, claimedFrom: null, claimedBy: null },
      });
      await writeAudit(tx, { tenantId, kind: "app", appSlug: "system" }, "content_item", id, "update",
        { status: state.status, claimedBy: row.claimedBy }, { status: next.state.status, reason: "stale_claim" });
      released += 1;
    });
  }
  return released;
}

/**
 * §6b: put an item into (or take it out of) a cold-email step slot. Any status
 * may be assigned - the campaign screen shows what is waiting - but only a LIVE
 * item ever feeds a draft (see lib/outreach/template.ts). A slot holds exactly
 * one item: taking a slot that is already filled is a 409, never a silent steal.
 */
export async function setOutreachSlot(
  actor: UserActor,
  itemId: number,
  slot: { campaign: string; step: number } | null,
): Promise<{ ok: true } | Fail> {
  if (slot) {
    if (!slot.campaign.trim()) return fail(400, "Hiányzik a kampány");
    if (!Number.isInteger(slot.step) || slot.step < 1 || slot.step > MAX_STEP) {
      return fail(400, `Az érintés sorszáma 1 és ${MAX_STEP} között lehet`);
    }
  }
  return db.$transaction(async (tx) => {
    const row = await tx.contentItem.findFirst({
      where: { id: itemId, tenantId: actor.tenantId },
      select: { id: true, category: true, outreachCampaign: true, outreachStep: true },
    });
    if (!row) return fail(404, "Nem található");
    if (slot && row.category !== "email") {
      return fail(400, "Csak e-mail tartalom tehető kampánylépésbe");
    }
    if (slot) {
      const taken = await tx.contentItem.findFirst({
        where: {
          tenantId: actor.tenantId, outreachCampaign: slot.campaign.trim(), outreachStep: slot.step,
          id: { not: itemId },
        },
        select: { id: true, title: true },
      });
      if (taken) return fail(409, `Ezt a lépést már betölti: ${taken.title}`);
    }
    try {
      await tx.contentItem.update({
        where: { id: itemId },
        data: {
          outreachCampaign: slot ? slot.campaign.trim() : null,
          outreachStep: slot ? slot.step : null,
        },
      });
    } catch (err) {
      // The partial unique index is the real gate; the lookup above only lets
      // us name the occupying item. A concurrent assignment loses here, and
      // must read as the designed 409, not a 500 (Vanda, #105).
      if ((err as { code?: string }).code === "P2002") {
        return fail(409, "Ezt a lépést közben betöltötte egy másik tartalom");
      }
      throw err;
    }
    await writeAudit(tx, actor, "content_item", itemId, "update",
      { outreachCampaign: row.outreachCampaign, outreachStep: row.outreachStep },
      { outreachCampaign: slot?.campaign.trim() ?? null, outreachStep: slot?.step ?? null });
    return { ok: true as const };
  });
}

export async function archiveItem(actor: UserActor, itemId: number): Promise<{ ok: true } | Fail> {
  return db.$transaction(async (tx) => {
    const row = await lockItem(tx, actor.tenantId, itemId);
    if (!row) return fail(404, "Nem található");
    const state = stateOf(row);
    if (state.status === "archived") return { ok: true as const }; // already archived: keep prevStatus
    const next = applyEvent(state, { type: "archive" });
    if (!next.ok) return fail(409, next.reason);
    // Never restore INTO ai_working: the claim is cleared here, so the item would
    // be stuck (not stale, not claimable, not reviewable). Restore where the AI
    // took it from instead (Vanda, #103 finding 4).
    const restoreTo = state.status === "ai_working" ? (state.claimedFrom ?? "in_review") : state.status;
    await tx.contentItem.update({
      where: { id: itemId },
      data: {
        status: "archived", prevStatus: restoreTo,
        claimedAt: null, claimedFrom: null, claimedBy: null,
      },
    });
    await writeAudit(tx, actor, "content_item", itemId, "update", { status: state.status }, { status: "archived" });
    return { ok: true as const };
  });
}

/** Rule-check questions are prefixed so they can be told apart from ⚠ imports. */
const RULE_CHECK_PREFIX = "Szabály:";

/**
 * Run the blocking content rules against a body and reconcile them with the
 * item's rule checks (Áron 2026-09-17, "hard checks, code not prose"):
 *  - a new violation becomes an OPEN check, so the live gate blocks the item
 *    exactly like an imported ⚠ question;
 *  - a violation that the new version fixed is auto-resolved, with a note;
 *  - the caller decides the status (a violated item goes back to the AI queue).
 * Returns the violations found.
 */
async function reconcileRuleChecks(
  tx: Tx,
  tenantId: number,
  itemId: number,
  ctx: { category: string; format?: string | null; body: string; footer?: string | null; requiresFooter?: boolean; otherHooks?: string[]; recipientVerified?: boolean | null },
): Promise<{ rule: string; message: string }[]> {
  const violations = runContentRules(ctx);
  const open = violations.map((v) => `${RULE_CHECK_PREFIX} ${v.message}`);

  if (open.length > 0) {
    await tx.contentCheck.createMany({
      data: open.map((question) => ({
        tenantId, itemId, question: question.slice(0, CHECK_QUESTION_MAX),
        forWhom: "either", state: "open", source: "rule",
      })),
      skipDuplicates: true,
    });
    // A rule that fires again must be OPEN even if a human had waived it before.
    await tx.contentCheck.updateMany({
      where: { itemId, source: "rule", question: { in: open.map((q) => q.slice(0, CHECK_QUESTION_MAX)) } },
      data: { state: "open", answer: null, resolvedByUserId: null },
    });
  }

  // Everything else that came from a rule is fixed now.
  await tx.contentCheck.updateMany({
    where: {
      itemId, source: "rule", state: "open",
      ...(open.length ? { question: { notIn: open.map((q) => q.slice(0, CHECK_QUESTION_MAX)) } } : {}),
    },
    data: { state: "resolved", answer: "A szabály már nem sérül ebben a verzióban." },
  });

  return violations.map((v) => ({ rule: v.rule, message: v.message }));
}

/** Context the rules need that lives in other rows (footer, sibling hooks). */
async function ruleContextFor(
  tx: Tx,
  tenantId: number,
  item: { id: number; category: string; format?: string | null; campaignId?: number | null },
  body: string,
): Promise<Parameters<typeof reconcileRuleChecks>[3]> {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const footer = (tenant?.settings as Record<string, unknown> | null)?.outreachFooter;
  // Only the opening of each sibling is needed (duplicate-hook detection), so
  // the bodies are truncated in SQL instead of loaded whole (Vanda, #104).
  const siblings = item.campaignId
    ? await tx.$queryRaw<{ hook: string }[]>`
        SELECT left(v."body", 200) AS hook
        FROM "content_items" i
        JOIN "content_versions" v ON v."id" = i."current_version_id"
        WHERE i."tenant_id" = ${tenantId}
          AND i."campaign_id" = ${item.campaignId}
          AND i."id" <> ${item.id}
          AND i."status" <> 'archived'
        LIMIT 100`
    : [];
  return {
    category: item.category,
    format: item.format ?? null,
    body,
    footer: typeof footer === "string" ? footer : null,
    // Cold outreach email copy must carry the consent line.
    requiresFooter: item.category === "email",
    otherHooks: siblings.map((s) => s.hook ?? "").filter(Boolean),
  };
}

// ── §6c: ⚠ checks, restore, hard delete ─────────────────────────────────────

export const SELF_NOTE_MAX = 500;
/** A confidence outside 0..1 (or not a number) is stored as null, never clamped silently into a lie. */
export function clampSelfScore(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}

export const CHECK_QUESTION_MAX = 500;
export const CHECK_ANSWER_MAX = 2000;
export const CHECK_STATES = ["open", "resolved", "waived"] as const;
export type CheckState = (typeof CHECK_STATES)[number];
export const CHECK_FOR = ["aron", "peter", "either"] as const;

export interface CheckInput {
  question: string;
  forWhom?: string;
  source?: "import" | "manual";
}

/**
 * Create checks for an item, skipping ones whose question already exists
 * (the import is re-runnable). Returns how many were created.
 */
export async function addChecks(
  actor: ContentActor, itemId: number, checks: CheckInput[],
): Promise<{ ok: true; created: number } | Fail> {
  const item = await db.contentItem.findFirst({ where: { id: itemId, tenantId: actor.tenantId }, select: { id: true } });
  if (!item) return fail(404, "Nem található");
  const clean = checks
    .map((c) => ({
      question: c.question.trim().slice(0, CHECK_QUESTION_MAX),
      forWhom: (CHECK_FOR as readonly string[]).includes(c.forWhom ?? "") ? c.forWhom! : "either",
      source: c.source ?? "manual",
    }))
    .filter((c) => c.question.length > 0);
  if (clean.length === 0) return { ok: true, created: 0 };
  const res = await db.contentCheck.createMany({
    data: clean.map((c) => ({ tenantId: actor.tenantId, itemId, ...c })),
    skipDuplicates: true,
  });
  if (res.count > 0) {
    await db.$transaction((tx) =>
      writeAudit(tx, actor, "content_item", itemId, "create", null, { checksCreated: res.count }));
  }
  return { ok: true, created: res.count };
}

/**
 * Settle or re-open a check. Settling the LAST open one re-evaluates the item:
 * if both reviewers had already approved the current version, it goes live now.
 */
export async function setCheckState(
  actor: UserActor, checkId: number, state: CheckState, text?: string | null,
): Promise<{ ok: true; itemStatus: ContentStatus; wentLive: boolean } | Fail> {
  const answer = text?.trim() || null;
  if (state !== "open" && (!answer || answer.length < 2)) {
    return fail(400, state === "resolved" ? "Írd le a választ" : "Írd le, miért nem kell ez");
  }
  if (answer && answer.length > CHECK_ANSWER_MAX) return fail(400, "A válasz túl hosszú");

  return db.$transaction(async (tx) => {
    const check = await tx.contentCheck.findFirst({
      where: { id: checkId, tenantId: actor.tenantId },
      select: { id: true, itemId: true, state: true, question: true, source: true },
    });
    if (!check) return fail(404, "Nem található");
    if (check.source === "rule") {
      // A machine rule is code, not prose: the only way to clear it is a new
      // version that passes the rule (reconcileRuleChecks closes it). Letting a
      // human waive it would make every hard rule advisory, and would let a
      // non-reviewer push an item with a forbidden claim straight to live.
      return fail(403, "Szabály-ellenőrzést nem lehet kézzel lezárni: javítsd a szöveget");
    }
    const row = await lockItem(tx, actor.tenantId, check.itemId);
    if (!row) return fail(404, "Nem található");

    await tx.contentCheck.update({
      where: { id: checkId },
      data: {
        state,
        answer: state === "open" ? null : answer,
        resolvedByUserId: state === "open" ? null : actor.userId,
      },
    });
    await writeAudit(tx, actor, "content_item", check.itemId, "update",
      { check: check.question, state: check.state }, { check: check.question, state, answer });

    // Re-evaluate: reviews unchanged, but the check gate may have opened/closed.
    const state0 = stateOf(row);
    if (state0.status === "archived" || state0.currentVersionId === null) {
      return { ok: true as const, itemStatus: state0.status, wentLive: false };
    }
    const reviews = await tx.contentReview.findMany({
      where: { versionId: state0.currentVersionId }, select: { reviewerUserId: true, verdict: true },
    });
    const openChecks = await tx.contentCheck.count({ where: { itemId: check.itemId, state: "open" } });
    const rule = await getApprovalRule(actor.tenantId, row.category, tx);
    const next = applyEvent(state0, {
      type: "reviews_changed", reviewers: rule.reviewers,
      reviews: reviews.map((r) => ({ reviewerUserId: r.reviewerUserId, verdict: r.verdict as Verdict })),
      openChecks,
      requiredApprovals: rule.required,
    });
    if (!next.ok) return { ok: true as const, itemStatus: state0.status, wentLive: false };
    await tx.contentItem.update({
      where: { id: check.itemId },
      data: {
        status: next.state.status, liveVersionId: next.state.liveVersionId,
        ...(next.wentLive ? { wasLive: true } : {}),
      },
    });
    if (next.wentLive) {
      await writeAudit(tx, actor, "content_item", check.itemId, "update",
        { status: state0.status }, { status: "live", liveVersionId: next.state.liveVersionId, reason: "last_check_settled" });
    }
    return { ok: true as const, itemStatus: next.state.status, wentLive: next.wentLive };
  });
}

/** Un-archive: back to the status it had when it was archived. */
export async function restoreItem(actor: UserActor, itemId: number): Promise<{ ok: true; status: ContentStatus } | Fail> {
  return db.$transaction(async (tx) => {
    const row = await lockItem(tx, actor.tenantId, itemId);
    if (!row) return fail(404, "Nem található");
    if (row.status !== "archived") return fail(409, "Ez az anyag nincs archiválva");
    const back = isContentStatus(row.prevStatus) && row.prevStatus !== "archived" ? row.prevStatus : "in_review";
    await tx.contentItem.update({ where: { id: itemId }, data: { status: back, prevStatus: null } });
    await writeAudit(tx, actor, "content_item", itemId, "update", { status: "archived" }, { status: back });
    return { ok: true as const, status: back };
  });
}

export interface DeletableCheck { itemId: number; deletable: boolean; reason?: string }

/** Hard delete is only for items that were NEVER live (spec §6c). */
export async function canHardDelete(tenantId: number, itemIds: number[]): Promise<DeletableCheck[]> {
  const rows = await db.contentItem.findMany({
    where: { id: { in: itemIds }, tenantId },
    select: { id: true, wasLive: true, liveVersionId: true },
  });
  return itemIds.map((id) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return { itemId: id, deletable: false, reason: "Nem található" };
    if (row.wasLive || row.liveVersionId !== null) {
      return { itemId: id, deletable: false, reason: "Volt már élő: csak archiválható" };
    }
    return { itemId: id, deletable: true };
  });
}

/**
 * Hard delete: the item, its versions/reviews/checks (FK cascade) and every
 * uploaded storage object. Refused for anything that has ever been live.
 * Returns the storage paths the caller must remove (the service is DB-only so
 * it stays unit-testable; the action deletes the objects).
 */
export async function deleteItemHard(
  actor: UserActor, itemId: number,
): Promise<{ ok: true; storagePaths: string[]; title: string } | Fail> {
  const [gate] = await canHardDelete(actor.tenantId, [itemId]);
  if (!gate.deletable) return fail(gate.reason === "Nem található" ? 404 : 409, gate.reason ?? "Nem törölhető");
  return db.$transaction(async (tx) => {
    const row = await lockItem(tx, actor.tenantId, itemId);
    if (!row) return fail(404, "Nem található");
    if (row.wasLive || row.liveVersionId !== null) return fail(409, "Volt már élő: csak archiválható");
    const item = await tx.contentItem.findFirst({ where: { id: itemId, tenantId: actor.tenantId }, select: { title: true } });
    const assets = await tx.contentAsset.findMany({
      where: { tenantId: actor.tenantId, contentItemId: itemId, storagePath: { not: null } },
      select: { storagePath: true },
    });
    await writeAudit(tx, actor, "content_item", itemId, "delete",
      { title: item?.title ?? null, storageObjects: assets.length }, null);
    await tx.contentItem.update({ where: { id: itemId }, data: { currentVersionId: null, liveVersionId: null } });
    await tx.contentItem.delete({ where: { id: itemId } });
    return {
      ok: true as const,
      storagePaths: assets.map((a) => a.storagePath!).filter(Boolean),
      title: item?.title ?? `#${itemId}`,
    };
  });
}

// ── Read models ─────────────────────────────────────────────────────────────

export interface QueueItem {
  id: number;
  title: string;
  category: string;
  format: string | null;
  purpose: string | null;
  channel: string;
  status: string;
  externalRef: string | null;
  needsHumanAsset: boolean;
  campaign: { slug: string; name: string } | null;
  currentVersion: {
    id: number; number: number; body: string; changeNote: string | null; authorType: string;
    selfScore: number | null; selfNote: string | null;
  } | null;
  assets: { kind: string; mimeType: string | null; caption: string | null }[];
  /**
   * Every review on every version, newest first: why earlier versions failed.
   * `reason` is the structured tag (lib/content/reasons.ts) the reviewer picked.
   */
  reviews: { versionNumber: number; reviewer: string; verdict: string; reason: string | null; comment: string | null; at: string }[];
  versions: { id: number; number: number; changeNote: string | null; authorType: string; createdAt: string; selfScore: number | null }[];
  /** Blocking machine checks and imported warning questions that are still open. */
  openChecks: { id: number; question: string; forWhom: string; source: string }[];
  /** Answers a human gave: facts the rewrite may rely on. */
  settledChecks: { question: string; state: string; answer: string | null }[];
  /**
   * What the CRM knows about the company (Áron: a rewrite must never lose what
   * the drafting agent knew). READ-ONLY input: the skill may use these facts and
   * must never invent or alter one. Null when the item has no company.
   */
  company: {
    id: number;
    name: string;
    city: string | null;
    dossier: unknown;
    closenessScore: number | null;
    contact: { name: string; email: string | null; phone: string | null } | null;
  } | null;
}

export async function getQueue(tenantId: number, statuses: ContentStatus[]): Promise<QueueItem[]> {
  await releaseStaleClaims(tenantId);
  const items = await db.contentItem.findMany({
    where: { tenantId, status: { in: statuses } },
    orderBy: { updatedAt: "asc" },
    take: 100,
    select: {
      id: true, title: true, category: true, format: true, purpose: true, channel: true, status: true,
      externalRef: true, needsHumanAsset: true, currentVersionId: true, companyId: true,
      campaign: { select: { slug: true, name: true } },
      currentVersion: { select: { body: true } },
      // Capped: the payload is read by the rewrite skill, not archived. An item
      // with more than 50 questions is a data problem, not a rewrite (Vanda, #104).
      checks: {
        orderBy: [{ state: "asc" }, { id: "asc" }],
        take: 50,
        select: { id: true, question: true, forWhom: true, state: true, answer: true, source: true },
      },
      // Read-only facts for the rewrite: the dossier the enrichment skill wrote,
      // the closeness score and the verified contact.
      company: {
        select: {
          id: true, name: true, city: true, enrichment: true, closenessScore: true,
          contacts: {
            where: { endedAt: null },
            orderBy: [{ isPrimary: "desc" }, { startedAt: "desc" }],
            take: 1,
            select: {
              email: true, phone: true,
              person: { select: { firstName: true, lastName: true, email: true, phone: true } },
            },
          },
        },
      },
      versions: {
        orderBy: { number: "desc" },
        select: {
          id: true, number: true, changeNote: true, authorType: true, createdAt: true,
          selfScore: true, selfNote: true,
          reviews: {
            orderBy: { updatedAt: "desc" },
            select: { verdict: true, reason: true, comment: true, updatedAt: true, reviewer: { select: { name: true } } },
          },
          assets: { select: { kind: true, mimeType: true, caption: true } },
        },
      },
    },
  });
  return items.map((it) => {
    const current = it.versions.find((v) => v.id === it.currentVersionId) ?? null;
    return {
      id: it.id, title: it.title, category: it.category, format: it.format, purpose: it.purpose,
      channel: it.channel, status: it.status, externalRef: it.externalRef, needsHumanAsset: it.needsHumanAsset,
      campaign: it.campaign,
      currentVersion: current
        ? {
            id: current.id, number: current.number, body: it.currentVersion?.body ?? "",
            changeNote: current.changeNote, authorType: current.authorType,
            selfScore: current.selfScore ?? null, selfNote: current.selfNote ?? null,
          }
        : null,
      assets: current?.assets ?? [],
      reviews: it.versions.flatMap((v) => v.reviews.map((r) => ({
        versionNumber: v.number, reviewer: r.reviewer.name, verdict: r.verdict, reason: r.reason,
        comment: r.comment, at: r.updatedAt.toISOString(),
      }))),
      openChecks: it.checks
        .filter((c) => c.state === "open")
        .map((c) => ({ id: c.id, question: c.question, forWhom: c.forWhom, source: c.source })),
      settledChecks: it.checks
        .filter((c) => c.state !== "open")
        .map((c) => ({ question: c.question, state: c.state, answer: c.answer })),
      company: it.company
        ? {
            id: it.company.id,
            name: it.company.name,
            city: it.company.city,
            dossier: it.company.enrichment ?? null,
            closenessScore: it.company.closenessScore ?? null,
            contact: it.company.contacts[0]
              ? {
                  name: `${it.company.contacts[0].person.lastName} ${it.company.contacts[0].person.firstName}`.trim(),
                  email: it.company.contacts[0].email ?? it.company.contacts[0].person.email ?? null,
                  phone: it.company.contacts[0].phone ?? it.company.contacts[0].person.phone ?? null,
                }
              : null,
          }
        : null,
      versions: it.versions.map((v) => ({
        id: v.id, number: v.number, changeNote: v.changeNote, authorType: v.authorType,
        createdAt: v.createdAt.toISOString(), selfScore: v.selfScore ?? null,
      })),
    };
  });
}

export interface LiveItem {
  id: number;
  title: string;
  category: string;
  format: string | null;
  purpose: string | null;
  channel: string;
  campaign: { slug: string; name: string } | null;
  externalRef: string | null;
  /** Latest review time on the live version; null for imported-as-live items. */
  version: { id: number; number: number; body: string; lastReviewAt: string | null };
}

/** Dual-approved versions only. Never falls back to a draft (spec §6). */
export async function getLive(
  tenantId: number,
  filter: { category?: string; campaignSlug?: string; format?: string; itemIds?: number[] } = {},
): Promise<LiveItem[]> {
  const items = await db.contentItem.findMany({
    where: {
      tenantId,
      liveVersionId: { not: null },
      status: { not: "archived" },
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.format ? { format: filter.format } : {}),
      ...(filter.campaignSlug ? { campaign: { slug: filter.campaignSlug } } : {}),
      ...(filter.itemIds ? { id: { in: filter.itemIds } } : {}),
    },
    orderBy: { title: "asc" },
    select: {
      id: true, title: true, category: true, format: true, purpose: true, channel: true, externalRef: true,
      campaign: { select: { slug: true, name: true } },
      liveVersion: {
        select: { id: true, number: true, body: true, reviews: { select: { updatedAt: true } } },
      },
    },
  });
  return items
    .filter((it) => it.liveVersion)
    .map((it) => ({
      id: it.id, title: it.title, category: it.category, format: it.format, purpose: it.purpose,
      channel: it.channel, campaign: it.campaign, externalRef: it.externalRef,
      version: {
        id: it.liveVersion!.id,
        number: it.liveVersion!.number,
        body: it.liveVersion!.body,
        lastReviewAt: it.liveVersion!.reviews.length
          ? new Date(Math.max(...it.liveVersion!.reviews.map((r) => r.updatedAt.getTime()))).toISOString()
          : null,
      },
    }));
}
