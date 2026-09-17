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
  archiveItem, createVersion, submitReview, type UserActor,
} from "@/lib/content/service";
import { getContentReviewers, REQUIRED_REVIEWERS } from "@/lib/content/reviewers";
import { digestOptOutFromSettings } from "@/lib/content/digest";
import { CONTENT_BODY_MAX, CHANGE_NOTE_MAX, REVIEW_COMMENT_MAX, VERDICTS } from "@/lib/content/types";
import {
  ALLOWED_MIME, MAX_ASSET_BYTES, createUploadUrl, isPathForItem, stagingPath, statObject,
} from "@/lib/content/storage";
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
});

/** ✅ / ✏️ / ♻️ on the current version — for yourself only. */
export async function submitContentReview(
  input: z.input<typeof reviewInput>,
): Promise<{ ok: true; status: string; wentLive: boolean } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = reviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };

  const res = await submitReview(actor, parsed.data.versionId, parsed.data.verdict, parsed.data.comment);
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
    if (!stat) return { ok: false, error: "A feltöltött fájl nem található — töltsd fel újra" };
    const kind = ALLOWED_MIME[stat.mimeType];
    if (!kind || stat.size > MAX_ASSET_BYTES) return { ok: false, error: "A feltöltött fájl típusa vagy mérete nem megengedett" };
    out.push({ kind, url: u.path, storagePath: u.path, mimeType: stat.mimeType, sizeBytes: stat.size, caption: u.caption ?? null });
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
): Promise<{ ok: true; versionId: number; number: number } | Fail> {
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
 * Tenant config: who the two reviewers are. Exactly two distinct, logged-in-able
 * CRM users; the caller must be one of them (a non-reviewer cannot hand the
 * approval power to someone else). Audited.
 */
export async function saveContentReviewers(userIds: number[]): Promise<{ ok: true } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = z.array(z.number().int().positive()).length(REQUIRED_REVIEWERS).safeParse(userIds);
  const ids = parsed.success ? [...new Set(parsed.data)] : [];
  if (ids.length !== REQUIRED_REVIEWERS) return { ok: false, error: "Pontosan két különböző bírálót kell megadni" };
  if (!ids.includes(actor.userId)) return { ok: false, error: "Csak saját magadat és egy társbírálót adhatsz meg" };
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

/** A user can only change THEIR OWN opt-out — no one else's digest setting. */
export async function setMyDigestEnabled(enabled: boolean): Promise<{ ok: true } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const tenant = await db.tenant.findUnique({ where: { id: TENANT_ID }, select: { settings: true } });
  const before = digestOptOutFromSettings(tenant?.settings);
  const next = enabled
    ? before.filter((id) => id !== actor.userId)
    : before.includes(actor.userId) ? before : [...before, actor.userId];
  await setTenantSettings(TENANT_ID, { contentDigestOptOut: next });
  audit("tenant", TENANT_ID, "update", { contentDigestOptOut: before }, { contentDigestOptOut: next }, { tenantId: TENANT_ID });
  return { ok: true };
}
