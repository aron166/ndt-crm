"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { audit } from "@/lib/audit";
import { normalizeSenderProfile } from "@/lib/sender-profile";

const TENANT_ID = 1;

/**
 * The signed-in user's own sender name and phone: users.name and users.settings.phone, the two
 * values the e-mail preview and the launch check read (lib/campaigns/preview.ts). Only the caller's
 * own row is written. One statement with jsonb_set / `-` so the theme key in the same bag survives.
 */
export async function saveSenderProfile(input: { name: string; phone: string }) {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const p = normalizeSenderProfile(input);
  if (!p.ok) return { error: p.error };

  const rows = p.phone == null
    ? await db.$executeRaw`
        UPDATE "users" SET "name" = ${p.name}, "settings" = COALESCE("settings", '{}'::jsonb) - 'phone'
         WHERE "id" = ${userId} AND "tenant_id" = ${TENANT_ID}`
    : await db.$executeRaw`
        UPDATE "users" SET "name" = ${p.name},
               "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), ARRAY['phone'], ${JSON.stringify(p.phone)}::jsonb, true)
         WHERE "id" = ${userId} AND "tenant_id" = ${TENANT_ID}`;
  if (rows === 0) return { error: NOT_A_CRM_USER };

  audit("user", userId, "update", null, { name: p.name, phone: p.phone });
  revalidatePath("/campaigns", "layout");
  revalidatePath("/settings");
  return { ok: true as const };
}
