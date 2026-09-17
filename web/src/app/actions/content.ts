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
import { getContentReviewers, MAX_REVIEWERS } from "@/lib/content/reviewers";
import { CONTENT_BODY_MAX, CHANGE_NOTE_MAX, REVIEW_COMMENT_MAX, VERDICTS } from "@/lib/content/types";

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
  revalidatePath("/content");
  revalidatePath("/content/live");
  if (itemId) revalidatePath(`/content/${itemId}`);
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
});

/** ✎ Szerkesztés — always a new version; both approvals reset (spec decision 3). */
export async function saveContentVersion(
  input: z.input<typeof versionInput>,
): Promise<{ ok: true; versionId: number; number: number } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = versionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };
  const { itemId, ...rest } = parsed.data;
  if (!rest.body.trim()) return { ok: false, error: "A szöveg nem lehet üres" };

  const res = await createVersion(actor, itemId, rest);
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

/** Tenant config: who the two reviewers are. Any CRM user may set it (same as the other /leads/setup settings). */
export async function saveContentReviewers(userIds: number[]): Promise<{ ok: true } | Fail> {
  const actor = await userActor();
  if ("ok" in actor) return actor;
  const parsed = z.array(z.number().int().positive()).max(MAX_REVIEWERS).safeParse(userIds);
  if (!parsed.success) return { ok: false, error: `Legfeljebb ${MAX_REVIEWERS} bíráló adható meg` };
  const ids = [...new Set(parsed.data)];
  const found = await db.user.count({ where: { tenantId: TENANT_ID, id: { in: ids } } });
  if (found !== ids.length) return { ok: false, error: "Ismeretlen felhasználó" };
  const before = await setTenantSettings(TENANT_ID, { contentReviewers: ids });
  audit("tenant", TENANT_ID, "update", before, { contentReviewers: ids }, { tenantId: TENANT_ID });
  revalidateContent();
  return { ok: true };
}
