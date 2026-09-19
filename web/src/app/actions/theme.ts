"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import type { Theme } from "@/lib/theme";

const TENANT_ID = 1;

/**
 * Persist the signed-in user's theme on their `users` row.
 *
 * Merged into `settings` rather than replacing it, so the next preference to
 * land in that bag does not wipe this one.
 */
export async function setTheme(theme: Theme) {
  if (theme !== "light" && theme !== "dark") return { error: "Ismeretlen téma" };

  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };

  const row = await db.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  const current =
    row?.settings && typeof row.settings === "object" && !Array.isArray(row.settings)
      ? (row.settings as Record<string, unknown>)
      : {};

  // updateMany, not update: it is the only form that takes tenantId in the
  // where (rule 5 — app-level scoping is the only guard, RLS is not enforced).
  await db.user.updateMany({
    where: { id: userId, tenantId: TENANT_ID },
    data: { settings: { ...current, theme } },
  });

  // The attribute is rendered by the root layout, so every route's HTML is
  // stale after a flip.
  revalidatePath("/", "layout");
  return { ok: true as const };
}
