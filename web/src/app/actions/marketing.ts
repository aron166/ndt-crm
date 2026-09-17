"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { createVersion } from "@/lib/content/service";

// Legacy marketing actions (pre content-approval). Approve / reject / back to
// edit are GONE — status now only changes through lib/content/service.ts
// (reviews, versions). What remains: edit (= a new version), and recording a
// manual publication of a LIVE item, which no longer changes its status.

const TENANT_ID = 1;

async function requireUser(): Promise<{ userId: number } | { error: string }> {
  const { userId } = await getActor(TENANT_ID);
  return userId == null ? { error: NOT_A_CRM_USER } : { userId };
}

async function loadItem(id: number) {
  return db.contentItem.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: {
      id: true, status: true, internal: true, title: true, body: true,
      currentVersionId: true, liveVersionId: true, publishedAt: true,
    },
  });
}

function revalidate(id: number) {
  revalidatePath("/marketing");
  revalidatePath(`/marketing/${id}`);
  revalidatePath("/content");
  revalidatePath(`/content/${id}`);
}

/** Edit = a new version (spec decision 3); the title is item metadata. */
export async function updateContent(id: number, title: string, body: string) {
  const me = await requireUser();
  if ("error" in me) return me;
  const item = await loadItem(id);
  if (!item) return { error: "Tartalom nem található" };
  if (!item.currentVersionId) return { error: "A tartalomnak nincs verziója" };

  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (!cleanTitle) return { error: "A cím kötelező" };
  if (!cleanBody) return { error: "A szöveg kötelező" };

  // Version first: if it is refused (stale base, archived) nothing is saved.
  if (cleanBody !== item.body) {
    const res = await createVersion(
      { tenantId: TENANT_ID, kind: "user", userId: me.userId },
      id,
      { body: cleanBody, basedOnVersionId: item.currentVersionId },
    );
    if (!res.ok) return { error: res.error };
  }
  if (cleanTitle !== item.title) {
    await db.contentItem.update({ where: { id }, data: { title: cleanTitle } });
    audit("content_item", id, "update", { title: item.title }, { title: cleanTitle });
  }
  revalidate(id);
  return { success: true };
}

/**
 * Manual-publish flow (the "Másolás" button): the operator copied the body and
 * posted it themselves; entering the URL marks it published in one step.
 * INTERNAL items are never postable — guarded here as the hard backstop behind
 * the hidden UI.
 */
export async function publishContent(id: number, externalUrl: string) {
  const me = await requireUser();
  if ("error" in me) return me;
  const item = await loadItem(id);
  if (!item) return { error: "Tartalom nem található" };
  if (item.internal) return { error: "Belső tartalom nem publikálható" };
  // Only dual-approved content may go out (spec §6).
  if (!item.liveVersionId) return { error: "Csak élő (mindkét bíráló által jóváhagyott) tartalom tehető közzé" };

  const url = externalUrl?.trim();
  if (!url) return { error: "A megjelenés linkje kötelező" };
  // Only http(s) — new URL() also accepts javascript:/data:, which would become
  // a stored XSS sink once rendered into an href.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "Érvénytelen URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Csak http/https link engedélyezett" };
  }

  const publishedAt = new Date();
  await db.contentItem.update({ where: { id }, data: { publishedAt, externalUrl: url } });
  audit("content_item", id, "update", { publishedAt: item.publishedAt }, { publishedAt, externalUrl: url });
  revalidate(id);
  return { success: true };
}

/** Manual metrics entry on a published item. */
export async function saveContentMetrics(
  id: number,
  metrics: { impressions?: number; reactions?: number; comments?: number; clicks?: number; leads?: number },
) {
  const me = await requireUser();
  if ("error" in me) return me;
  const item = await loadItem(id);
  if (!item) return { error: "Tartalom nem található" };
  if (!item.publishedAt) return { error: "Metrikák csak megjelent tartalmon" };

  await db.contentItem.update({ where: { id }, data: { metrics } });
  audit("content_item", id, "update", null, { metrics });
  revalidate(id);
  return { success: true };
}
