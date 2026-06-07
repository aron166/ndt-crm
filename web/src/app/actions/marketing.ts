"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { assertTransition, InvalidTransitionError } from "@/lib/marketing/transitions";
import { dispatchApprovalWebhook } from "@/lib/marketing/webhook";
import type { ContentStatus } from "@/lib/marketing/types";

const TENANT_ID = 1;

async function loadItem(id: number) {
  return db.contentItem.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { id: true, status: true, internal: true, title: true, body: true },
  });
}

function revalidate(id: number) {
  revalidatePath("/marketing");
  revalidatePath(`/marketing/${id}`);
}

/** In-place edit of title/body — the human edit IS the language pass. */
export async function updateContent(id: number, title: string, body: string) {
  const item = await loadItem(id);
  if (!item) return { error: "Tartalom nem található" };
  if (item.status === "published") return { error: "Megjelent tartalom nem szerkeszthető" };

  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (!cleanTitle) return { error: "A cím kötelező" };
  if (!cleanBody) return { error: "A szöveg kötelező" };

  await db.contentItem.update({
    where: { id },
    data: { title: cleanTitle, body: cleanBody },
  });

  audit("content_item", id, "update",
    { title: item.title },
    { title: cleanTitle },
  );
  revalidate(id);
  return { success: true };
}

async function transition(id: number, to: ContentStatus, extra: Record<string, unknown> = {}) {
  const item = await loadItem(id);
  if (!item) return { error: "Tartalom nem található" as const };
  try {
    assertTransition(item.status as ContentStatus, to);
  } catch (e) {
    if (e instanceof InvalidTransitionError) return { error: "Érvénytelen státuszváltás" as const };
    throw e;
  }
  await db.contentItem.update({ where: { id }, data: { status: to, ...extra } });
  audit("content_item", id, "update", { status: item.status }, { status: to });
  revalidate(id);
  return { success: true as const, fromStatus: item.status as ContentStatus };
}

/** Approve → fires the downstream webhook (non-blocking, best-effort). */
export async function approveContent(id: number) {
  const res = await transition(id, "approved");
  if ("error" in res) return res;

  // Fire the approval webhook AFTER the approval is committed. A failure must
  // never undo the approval — log it (console + audit) and move on.
  const full = await db.contentItem.findFirst({
    where: { id, tenantId: TENANT_ID },
    include: { assets: { orderBy: { position: "asc" } } },
  });
  if (full) {
    const result = await dispatchApprovalWebhook({
      event: "content.approved",
      item: {
        id: full.id,
        tenantId: full.tenantId,
        campaignId: full.campaignId,
        channel: full.channel,
        contentType: full.contentType,
        title: full.title,
        body: full.body,
        status: full.status,
        internal: full.internal,
        scheduledFor: full.scheduledFor?.toISOString() ?? null,
        source: full.source,
        sourceMeta: full.sourceMeta,
        externalUrl: full.externalUrl,
      },
      assets: full.assets.map((a) => ({
        kind: a.kind, url: a.url, caption: a.caption, position: a.position,
      })),
    });
    if (result.attempted && !result.ok) {
      console.error("[marketing] approval webhook failed", { id, error: result.error });
    }
    if (result.attempted) {
      audit("content_item", id, "update",
        { webhook: "pending" },
        { webhook: result.ok ? "delivered" : `failed: ${result.error ?? "unknown"}` },
      );
    }
  }
  return { success: true };
}

/** Reject — requires a reason note. */
export async function rejectContent(id: number, reviewNote: string) {
  const note = reviewNote?.trim();
  if (!note) return { error: "Az elutasításhoz indoklás szükséges" };
  return transition(id, "rejected", { reviewNote: note });
}

/** Send back to editing (draft). */
export async function backToEditContent(id: number) {
  return transition(id, "draft");
}

/**
 * Manual-publish flow (the "Másolás" button): the operator copied the body and
 * posted it themselves; entering the URL marks it published in one step.
 * INTERNAL items are never postable — guarded here as the hard backstop behind
 * the hidden UI.
 */
export async function publishContent(id: number, externalUrl: string) {
  const item = await loadItem(id);
  if (!item) return { error: "Tartalom nem található" };
  if (item.internal) return { error: "Belső tartalom nem publikálható" };

  const url = externalUrl?.trim();
  if (!url) return { error: "A megjelenés linkje kötelező" };
  try {
    new URL(url);
  } catch {
    return { error: "Érvénytelen URL" };
  }

  return transition(id, "published", { publishedAt: new Date(), externalUrl: url });
}

/** Manual metrics entry on a published item. */
export async function saveContentMetrics(
  id: number,
  metrics: { impressions?: number; reactions?: number; comments?: number; clicks?: number; leads?: number },
) {
  const item = await loadItem(id);
  if (!item) return { error: "Tartalom nem található" };
  if (item.status !== "published") return { error: "Metrikák csak megjelent tartalmon" };

  await db.contentItem.update({ where: { id }, data: { metrics } });
  audit("content_item", id, "update", null, { metrics });
  revalidate(id);
  return { success: true };
}
