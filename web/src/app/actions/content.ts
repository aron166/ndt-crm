"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { setTenantSettings } from "@/lib/tenant-settings";
import { dispatchApprovalWebhook } from "@/lib/marketing/webhook";
import { reportError } from "@/lib/report-error";
import {
  addChecks, archiveItem, canHardDelete, createVersion, deleteItemHard, restoreItem,
  setCheckState, submitReview, CHECK_ANSWER_MAX, CHECK_FOR, CHECK_QUESTION_MAX, CHECK_STATES,
  type UserActor,
} from "@/lib/content/service";
import {
  approvalsFromSettings, getContentReviewers, requiredApprovalsFor, MAX_REVIEWERS, MIN_REVIEWERS,
} from "@/lib/content/reviewers";
import { digestOptOutFromSettings } from "@/lib/content/digest";
import { CONTENT_CATEGORIES, CONTENT_BODY_MAX, CHANGE_NOTE_MAX, REVIEW_COMMENT_MAX, VERDICTS } from "@/lib/content/types";
import {
  ALLOWED_MIME, MAX_ASSET_BYTES, createUploadUrl, isPathForItem, removeObjects, stagingPath, statObject,
} from "@/lib/content/storage";
import { generateThumbnail } from "@/lib/content/thumbnails";
import type { NewAssetInput } from "@/lib/content/service";

// Content approval — human side (spec 2026-09-17). Every action resolves the
// CRM user itself; review writes are additionally gated on the configured
// reviewer list inside the service. There is deliberately no action that sets
// `live` directly: live is only ever the result of two approvals.

const TENANT_ID = 1;
type Fail = { ok: false; error: string };

async function userActor(): Promise<UserActor | Fail> {
  const { userId } = await getActor(TENANT_ID);
  return userId == null ? { ok: false, error: NOT_A_CRM_USER } : { tenantId: TENANT_ID, kind: "user", userId };
}

function revalidateContent(itemId?: number) {
  revalidatePath("/marketing");
  if (itemId) revalidatePath(`/marketing/${itemId}`);
}

const reviewInput = z.object({
  versionId: z.number().int().positive(),
  verdict: z.enum(VERDICTS),
  comment: z.string().max(REVIEW_COMMENT_MAX).optional(),
  /** Required for changes/rewrite (lib/content/reasons.ts). */
  reason: z.string().max(40).optional(),
});

/** ✅ / ✏️ / ♻️ on the current version — for yourself only. */
export async function submitContentReview(
  input: z.input<typeof reviewInput>,
): Promise<{ ok: true; status: string; wentLive: boolean } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = reviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };

  const res = await submitReview(actor, parsed.data.versionId, parsed.data.verdict, parsed.data.comment, parsed.data.reason);
  if (!res.ok) return { ok: false, error: res.error };

  const version = await db.contentVersion.findFirst({
    where: { id: parsed.data.versionId, tenantId: TENANT_ID }, select: { itemId: true },
  });
  if (res.wentLive && version) await fireLiveWebhook(version.itemId);
  revalidateContent(version?.itemId);
  return { ok: true, status: res.status, wentLive: res.wentLive };
}

/** The downstream hand-off that used to fire on "approved" now fires on live. */
async function fireLiveWebhook(itemId: number) {
  try {
    const full = await db.contentItem.findFirst({
      where: { id: itemId, tenantId: TENANT_ID },
      include: { liveVersion: { select: { body: true, id: true } }, assets: { orderBy: { position: "asc" } } },
    });
    if (!full?.liveVersion) return;
    const result = await dispatchApprovalWebhook({
      event: "content.approved",
      liveVersionId: full.liveVersion.id,
      item: {
        id: full.id, tenantId: full.tenantId, campaignId: full.campaignId, channel: full.channel,
        contentType: full.contentType, title: full.title, body: full.liveVersion.body, status: full.status,
        internal: full.internal, scheduledFor: full.scheduledFor?.toISOString() ?? null,
        source: full.source, sourceMeta: full.sourceMeta, externalUrl: full.externalUrl,
      },
      assets: full.assets
        .filter((a) => a.versionId === null || a.versionId === full.liveVersion!.id)
        .map((a) => ({ kind: a.kind, url: a.url, caption: a.caption, position: a.position })),
    });
    if (result.attempted) {
      audit("content_item", itemId, "update", { webhook: "pending" },
        { webhook: result.ok ? "delivered" : `failed: ${result.error ?? "unknown"}` });
    }
  } catch (err) {
    // Never undo the live switch because a hand-off failed.
    reportError("content.liveWebhook", err, { itemId });
  }
}

const versionInput = z.object({
  itemId: z.number().int().positive(),
  basedOnVersionId: z.number().int().positive(),
  body: z.string().min(1).max(CONTENT_BODY_MAX),
  changeNote: z.string().max(CHANGE_NOTE_MAX).optional(),
  /** Files of the base version to keep (by asset id). Omitted = keep all. */
  keepAssetIds: z.array(z.number().int().positive()).max(50).optional(),
  /** Files uploaded via requestAssetUpload for this edit. */
  uploads: z.array(z.object({
    path: z.string().min(1).max(500),
    caption: z.string().trim().max(500).optional(),
  })).max(20).optional(),
  /** External links (http/https) added in this edit. */
  links: z.array(z.object({ url: z.string().url().max(2000), caption: z.string().trim().max(500).optional() })).max(20).optional(),
});

/**
 * Step 1 of attaching a file: a signed upload URL for one exact staging path
 * under this item. The file only becomes part of the content when a version
 * is saved with it (saveContentVersion) — attaching IS an edit.
 */
export async function requestAssetUpload(input: {
  itemId: number; fileName: string; mimeType: string; sizeBytes: number;
}): Promise<{ ok: true; path: string; signedUrl: string; token: string } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = z.object({
    itemId: z.number().int().positive(),
    fileName: z.string().min(1).max(300),
    mimeType: z.string().max(100),
    sizeBytes: z.number().int().positive(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };
  const { itemId, fileName, mimeType, sizeBytes } = parsed.data;
  if (!ALLOWED_MIME[mimeType]) return { ok: false, error: "Ez a fájltípus nem tölthető fel (kép, mp4/webm videó vagy PDF)" };
  if (sizeBytes > MAX_ASSET_BYTES) return { ok: false, error: "A fájl legfeljebb 50 MB lehet" };
  const item = await db.contentItem.findFirst({ where: { id: itemId, tenantId: TENANT_ID }, select: { id: true, status: true } });
  if (!item) return { ok: false, error: "Nem található" };
  if (item.status === "archived") return { ok: false, error: "Archivált anyaghoz nem tölthető fel fájl" };
  // ponytail: staging objects of abandoned edits are never deleted. Add a sweep of
  // `staging/` objects no content_assets.storage_path references (> 1 day old) when
  // the bucket grows.
  try {
    const path = stagingPath(TENANT_ID, itemId, fileName);
    const { signedUrl, token } = await createUploadUrl(path);
    return { ok: true, path, signedUrl, token };
  } catch (err) {
    reportError("content.requestAssetUpload", err, { itemId });
    return { ok: false, error: "A feltöltés most nem indítható" };
  }
}

function isHttpUrl(u: string): boolean {
  try { const p = new URL(u); return p.protocol === "http:" || p.protocol === "https:"; } catch { return false; }
}

async function resolveAssets(
  itemId: number,
  basedOnVersionId: number,
  keepAssetIds: number[] | undefined,
  uploads: { path: string; caption?: string }[] | undefined,
  links: { url: string; caption?: string }[] | undefined,
): Promise<NewAssetInput[] | undefined | Fail> {
  if (keepAssetIds === undefined && !uploads?.length && !links?.length) return undefined; // carry forward all
  const base = await db.contentAsset.findMany({
    where: { tenantId: TENANT_ID, contentItemId: itemId, versionId: basedOnVersionId },
    orderBy: { position: "asc" },
    select: { id: true, kind: true, url: true, storagePath: true, mimeType: true, sizeBytes: true, caption: true },
  });
  const keep = keepAssetIds === undefined ? base : base.filter((a) => keepAssetIds.includes(a.id));
  const out: NewAssetInput[] = keep.map(({ id: _id, ...a }) => a);
  for (const u of uploads ?? []) {
    if (!isPathForItem(u.path, TENANT_ID, itemId)) return { ok: false, error: "Érvénytelen fájl" };
    // ponytail: size is the stored object's real size, but the MIME type is the
    // Content-Type the browser sent — a renamed file keeps a wrong label. Files are
    // served from the Supabase origin via signed URLs, so no XSS on the CRM origin.
    const stat = await statObject(u.path);
    if (!stat) return { ok: false, error: "A feltöltött fájl nem található: töltsd fel újra" };
    const kind = ALLOWED_MIME[stat.mimeType];
    if (!kind || stat.size > MAX_ASSET_BYTES) return { ok: false, error: "A feltöltött fájl típusa vagy mérete nem megengedett" };
    // A missing/failed thumbnail never blocks the save — generateThumbnail
    // reports and swallows its own errors, returning null.
    const thumb = kind === "image" ? await generateThumbnail(u.path) : null;
    out.push({
      kind, url: u.path, storagePath: u.path, mimeType: stat.mimeType, sizeBytes: stat.size,
      thumbPath: thumb?.path ?? null, caption: u.caption ?? null,
    });
  }
  for (const l of links ?? []) {
    if (!isHttpUrl(l.url)) return { ok: false, error: "Csak http/https link adható meg" };
    out.push({ kind: "link", url: l.url, caption: l.caption ?? null });
  }
  return out;
}

/** ✎ Szerkesztés — always a new version; both approvals reset (spec decision 3). */
export async function saveContentVersion(
  input: z.input<typeof versionInput>,
): Promise<{ ok: true; versionId: number; number: number; violations: { rule: string; message: string }[] } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = versionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };
  const { itemId, keepAssetIds, uploads, links, ...rest } = parsed.data;
  if (!rest.body.trim()) return { ok: false, error: "A szöveg nem lehet üres" };

  const assets = await resolveAssets(itemId, rest.basedOnVersionId, keepAssetIds, uploads, links);
  if (assets && !Array.isArray(assets)) return assets;
  const res = await createVersion(actor, itemId, { ...rest, assets });
  if (!res.ok) return { ok: false, error: res.error };
  revalidateContent(itemId);
  return res;
}

export async function archiveContent(itemId: number): Promise<{ ok: true } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  if (!Number.isInteger(itemId) || itemId <= 0) return { ok: false, error: "Érvénytelen adat" };
  const res = await archiveItem(actor, itemId);
  if (!res.ok) return { ok: false, error: res.error };
  revalidateContent(itemId);
  return { ok: true };
}

/** Title / purpose are item metadata, not reviewed copy — editing them is not a new version. */
export async function updateContentMeta(
  itemId: number,
  input: { title?: string; purpose?: string | null; format?: string | null },
): Promise<{ ok: true } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = z.object({
    title: z.string().trim().min(1).max(300).optional(),
    purpose: z.string().trim().max(300).nullable().optional(),
    format: z.string().trim().max(60).nullable().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };
  const before = await db.contentItem.findFirst({
    where: { id: itemId, tenantId: TENANT_ID }, select: { title: true, purpose: true, format: true },
  });
  if (!before) return { ok: false, error: "Nem található" };
  await db.contentItem.update({ where: { id: itemId }, data: parsed.data });
  audit("content_item", itemId, "update", before, parsed.data, { tenantId: TENANT_ID });
  revalidateContent(itemId);
  return { ok: true };
}

export interface ReviewerOption { id: number; name: string; email: string; selected: boolean }

export async function getContentReviewerOptions(): Promise<ReviewerOption[]> {
  const actor = await userActor();
  if ("ok" in actor) return [];
  const [users, selected] = await Promise.all([
    db.user.findMany({
      where: { tenantId: TENANT_ID, passwordHash: "supabase-auth" },
      select: { id: true, name: true, email: true }, orderBy: { id: "asc" },
    }),
    getContentReviewers(TENANT_ID),
  ]);
  return users.map((u) => ({ ...u, selected: selected.includes(u.id) }));
}

/**
 * Tenant config: who the reviewers are. One or two distinct CRM users, and the
 * caller must be one of them (a non-reviewer cannot hand the approval power to
 * someone else). How many approvals an item needs is a separate setting.
 */
export async function saveContentReviewers(userIds: number[]): Promise<{ ok: true } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  // Only a CURRENT reviewer may change who reviews. Without this any CRM user
  // could make themselves the sole reviewer, drop the category to one approval
  // and publish alone (Vanda, #104 critical).
  const current = await getContentReviewers(TENANT_ID);
  if (current.length > 0 && !current.includes(actor.userId)) {
    return { ok: false, error: "Csak bíráló módosíthatja a bírálók listáját" };
  }
  const parsed = z.array(z.number().int().positive()).min(MIN_REVIEWERS).max(MAX_REVIEWERS).safeParse(userIds);
  const ids = parsed.success ? [...new Set(parsed.data)] : [];
  if (ids.length < MIN_REVIEWERS || ids.length > MAX_REVIEWERS) {
    return { ok: false, error: `Egy vagy két bírálót adj meg` };
  }
  if (!ids.includes(actor.userId)) return { ok: false, error: "Magadat is add meg bírálóként" };
  const found = await db.user.count({ where: { tenantId: TENANT_ID, id: { in: ids }, passwordHash: "supabase-auth" } });
  if (found !== ids.length) return { ok: false, error: "Ismeretlen felhasználó" };
  const before = await setTenantSettings(TENANT_ID, { contentReviewers: ids });
  audit("tenant", TENANT_ID, "update", before, { contentReviewers: ids }, { tenantId: TENANT_ID });
  revalidateContent();
  return { ok: true };
}

/** ReviewerSettings toggle: whether the caller currently gets the daily digest (spec §5). */
export async function getMyDigestSetting(): Promise<{ enabled: boolean; isReviewer: boolean }> {
  const actor = await userActor();
  if ("ok" in actor) return { enabled: false, isReviewer: false };
  const [reviewers, tenant] = await Promise.all([
    getContentReviewers(TENANT_ID),
    db.tenant.findUnique({ where: { id: TENANT_ID }, select: { settings: true } }),
  ]);
  const isReviewer = reviewers.includes(actor.userId);
  const optOut = digestOptOutFromSettings(tenant?.settings);
  return { enabled: isReviewer && !optOut.includes(actor.userId), isReviewer };
}

/**
 * A user can only change THEIR OWN opt-out — no one else's digest setting.
 * Read-modify-write happens inside a `FOR UPDATE`-locked transaction so a
 * concurrent toggle (this user flipping it in two tabs, or racing the digest
 * setup save) can't read-then-clobber the other's write — setTenantSettings
 * isn't used here because it runs on the global client, outside the tx.
 */
export async function setMyDigestEnabled(enabled: boolean): Promise<{ ok: true } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = z.boolean().safeParse(enabled);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };

  const { before, next } = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT "id" FROM "tenants" WHERE "id" = ${TENANT_ID} FOR UPDATE`;
    const tenant = await tx.tenant.findUnique({ where: { id: TENANT_ID }, select: { settings: true } });
    const before = digestOptOutFromSettings(tenant?.settings);
    const next = parsed.data
      ? before.filter((id) => id !== actor.userId)
      : before.includes(actor.userId) ? before : [...before, actor.userId];
    await tx.$executeRaw`
      UPDATE "tenants"
         SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), '{contentDigestOptOut}', ${JSON.stringify(next)}::jsonb, true)
       WHERE "id" = ${TENANT_ID}`;
    return { before, next };
  });

  audit("tenant", TENANT_ID, "update", { contentDigestOptOut: before }, { contentDigestOptOut: next }, { tenantId: TENANT_ID });
  return { ok: true };
}


// ── §6c: ⚠ checks, archive/restore, hard delete, bulk ───────────────────────

/** Settle (or re-open) one ⚠ check. Settling the last one can flip the item live. */
export async function setContentCheck(input: {
  checkId: number; state: string; text?: string;
}): Promise<{ ok: true; itemStatus: string; wentLive: boolean } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = z.object({
    checkId: z.number().int().positive(),
    state: z.enum(CHECK_STATES),
    text: z.string().max(CHECK_ANSWER_MAX).optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };
  const res = await setCheckState(actor, parsed.data.checkId, parsed.data.state, parsed.data.text);
  if (!res.ok) return { ok: false, error: res.error };
  revalidateContent();
  return { ok: true, itemStatus: res.itemStatus, wentLive: res.wentLive };
}

/** Add a ⚠ question by hand (the import adds its own). */
export async function addContentCheck(input: {
  itemId: number; question: string; forWhom?: string;
}): Promise<{ ok: true; created: number } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = z.object({
    itemId: z.number().int().positive(),
    question: z.string().trim().min(3).max(CHECK_QUESTION_MAX),
    forWhom: z.enum(CHECK_FOR).optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };
  const res = await addChecks(actor, parsed.data.itemId, [{ question: parsed.data.question, forWhom: parsed.data.forWhom }]);
  if (!res.ok) return { ok: false, error: res.error };
  revalidateContent(parsed.data.itemId);
  return { ok: true, created: res.created };
}

export async function restoreContent(itemId: number): Promise<{ ok: true; status: string } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  if (!Number.isInteger(itemId) || itemId <= 0) return { ok: false, error: "Érvénytelen adat" };
  const res = await restoreItem(actor, itemId);
  if (!res.ok) return { ok: false, error: res.error };
  revalidateContent(itemId);
  return { ok: true, status: res.status };
}

/** Which of these items may be hard-deleted (the rest can only be archived). */
export async function checkContentDeletable(itemIds: number[]): Promise<{ itemId: number; deletable: boolean; reason?: string }[]> {
  const actor = await userActor();
  if ("ok" in actor) return [];
  const parsed = z.array(z.number().int().positive()).max(200).safeParse(itemIds);
  if (!parsed.success) return [];
  return canHardDelete(TENANT_ID, parsed.data);
}

/**
 * Hard delete — items that were never live only. Storage objects go too; a
 * failed object delete is reported, not retried (the row is already gone, and
 * a stray object is cheaper than a half-deleted item).
 */
export async function deleteContent(itemIds: number[]): Promise<{ ok: true; deleted: number[]; refused: { itemId: number; reason: string }[] } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = z.array(z.number().int().positive()).min(1).max(50).safeParse(itemIds);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };

  const deleted: number[] = [];
  const refused: { itemId: number; reason: string }[] = [];
  const paths: string[] = [];
  for (const id of parsed.data) {
    const res = await deleteItemHard(actor, id);
    if (res.ok) { deleted.push(id); paths.push(...res.storagePaths); }
    else refused.push({ itemId: id, reason: res.error });
  }
  if (paths.length) {
    try { await removeObjects(paths); }
    catch (err) { reportError("content.deleteContent.storage", err, { count: paths.length }); }
  }
  revalidateContent();
  return { ok: true, deleted, refused };
}

/** Bulk archive (the default cleanup action). */
export async function archiveContentBulk(itemIds: number[]): Promise<{ ok: true; archived: number[]; refused: { itemId: number; reason: string }[] } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = z.array(z.number().int().positive()).min(1).max(200).safeParse(itemIds);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };
  const archived: number[] = [];
  const refused: { itemId: number; reason: string }[] = [];
  for (const id of parsed.data) {
    const res = await archiveItem(actor, id);
    if (res.ok) archived.push(id);
    else refused.push({ itemId: id, reason: res.error });
  }
  revalidateContent();
  return { ok: true, archived, refused };
}

/** Undo of a bulk archive: restore each item to the status it had. */
export async function restoreContentBulk(itemIds: number[]): Promise<{ ok: true; restored: number[] } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = z.array(z.number().int().positive()).min(1).max(200).safeParse(itemIds);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };
  const restored: number[] = [];
  for (const id of parsed.data) {
    const res = await restoreItem(actor, id);
    if (res.ok) restored.push(id);
  }
  revalidateContent();
  return { ok: true, restored };
}


/** How many approvals each category needs (1 or 2). Audited; default stays 2. */
export async function getContentApprovals(): Promise<{ default: number; byCategory: Record<string, number> }> {
  const actor = await userActor();
  if ("ok" in actor) return { default: 2, byCategory: {} };
  const tenant = await db.tenant.findUnique({ where: { id: TENANT_ID }, select: { settings: true } });
  const cfg = approvalsFromSettings(tenant?.settings);
  const byCategory: Record<string, number> = {};
  for (const c of CONTENT_CATEGORIES) byCategory[c] = requiredApprovalsFor(tenant?.settings, c);
  return { default: cfg.default ?? 2, byCategory };
}

export async function saveContentApprovals(input: {
  default?: number; byCategory?: Record<string, number>;
}): Promise<{ ok: true } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  // How many approvals are needed is a reviewer decision, not any user's.
  const currentReviewers = await getContentReviewers(TENANT_ID);
  if (currentReviewers.length > 0 && !currentReviewers.includes(actor.userId)) {
    return { ok: false, error: "Csak bíráló módosíthatja a jóváhagyási szabályt" };
  }
  const count = z.union([z.literal(1), z.literal(2)]);
  const parsed = z.object({
    default: count.optional(),
    byCategory: z.record(z.enum(CONTENT_CATEGORIES), count).optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Egy vagy két jóváhagyás adható meg" };
  const tenant = await db.tenant.findUnique({ where: { id: TENANT_ID }, select: { settings: true } });
  const before = approvalsFromSettings(tenant?.settings);
  const next = {
    ...(parsed.data.default ? { default: parsed.data.default } : {}),
    ...(parsed.data.byCategory ? { byCategory: parsed.data.byCategory } : {}),
  };
  await setTenantSettings(TENANT_ID, { contentApprovals: next });
  audit("tenant", TENANT_ID, "update", { contentApprovals: before }, { contentApprovals: next }, { tenantId: TENANT_ID });
  revalidateContent();
  return { ok: true };
}
