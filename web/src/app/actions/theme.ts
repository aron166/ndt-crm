"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import type { Theme } from "@/lib/theme";

const TENANT_ID = 1;

/**
 * Persist the signed-in user's theme on their `users` row.
 *
 * One statement, mirroring lib/tenant-settings.ts: jsonb_set MERGES the key
 * into whatever else settings holds, so the next preference to land in that
 * bag cannot be wiped by a flip — and there is no read-then-write window.
 * tenant_id is in the WHERE because app-level scoping is the only guard
 * (rule 5 — RLS is not enforced).
 */
export async function setTheme(theme: Theme) {
  if (theme !== "light" && theme !== "dark") return { error: "Ismeretlen téma" };

  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };

  const rows = await db.$executeRaw`
    UPDATE "users"
       SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), ARRAY['theme'], ${JSON.stringify(theme)}::jsonb, true)
     WHERE "id" = ${userId} AND "tenant_id" = ${TENANT_ID}`;
  // Nothing written means nothing to show. Unreachable today, since
  // crmUserIdForEmail already resolves the id within this tenant — but
  // without the check the toggle would report success and roll nothing back.
  if (rows === 0) return { error: NOT_A_CRM_USER };

  // The attribute is rendered by the root layout, so every route's HTML is
  // stale after a flip.
  revalidatePath("/", "layout");
  return { ok: true as const };
}
