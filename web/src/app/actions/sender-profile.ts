"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { normalizeSenderProfile, normalizeSenderPhone } from "@/lib/sender-profile";

const TENANT_ID = 1;

/** Name of a running or paused campaign that sends as this user, else null. */
async function lockedBy(userId: number): Promise<string | null> {
  const c = await db.campaign.findFirst({ where: { tenantId: TENANT_ID, senderUserId: userId, status: { in: ["running", "paused"] } }, select: { name: true } });
  return c?.name ?? null;
}
// Hungarian copy is PROPOSAL. There is no "back to draft" button: an edit of a step or the daily cap does it (service.ts BACK_TO_DRAFT).
const lockedError = (name: string) =>
  `A „${name}” kampány ezzel a feladóval fut vagy szünetel. Jóváhagyás után a feladó neve és telefonszáma nem módosítható. Ha a kampány egy lépését vagy napi keretét módosítja, a kampány piszkozat lesz, utána mentheti.`;
const phoneInput = z.object({ userId: z.number().int().positive(), phone: z.string().max(40) });
const phoneOf = (settings: unknown): string | null => {
  const v = (settings as { phone?: unknown } | null)?.phone;
  return typeof v === "string" && v ? v : null;
};

/** A sender's phone from the campaign hub: the user themself or an admin. Phone only, name untouched. */
export async function saveSenderPhone(input: { userId: number; phone: string }) {
  const { userId: actorId } = await getActor(TENANT_ID);
  if (actorId == null) return { error: NOT_A_CRM_USER };
  const parsed = phoneInput.safeParse(input);
  if (!parsed.success) return { error: "Érvénytelen adat" };
  input = parsed.data;
  const target = await db.user.findFirst({ where: { id: input.userId, tenantId: TENANT_ID }, select: { id: true, settings: true } });
  if (!target) return { error: "Felhasználó nem található" };
  if (actorId !== input.userId) {
    const actor = await db.user.findFirst({ where: { id: actorId, tenantId: TENANT_ID }, select: { role: true } });
    if (actor?.role !== "admin") return { error: "Más telefonszámát csak admin módosíthatja" };
  }
  const p = normalizeSenderPhone(input.phone);
  if (!p.ok) return { error: p.error };
  const phone = p.phone;
  const current = phoneOf(target.settings);
  const changed = phone !== current;
  if (changed) {
    const locked = await lockedBy(input.userId);
    if (locked) return { error: lockedError(locked) };
  }
  const rows = phone == null
    ? await db.$executeRaw`
        UPDATE "users" SET "settings" = COALESCE("settings", '{}'::jsonb) - 'phone'
         WHERE "id" = ${input.userId} AND "tenant_id" = ${TENANT_ID}
           AND NOT EXISTS (SELECT 1 FROM "campaigns" c WHERE c."sender_user_id" = "users"."id" AND c."tenant_id" = "users"."tenant_id" AND c."status" IN ('running', 'paused'))`
    : await db.$executeRaw`
        UPDATE "users" SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), ARRAY['phone'], ${JSON.stringify(phone)}::jsonb, true)
         WHERE "id" = ${input.userId} AND "tenant_id" = ${TENANT_ID}
           AND NOT EXISTS (SELECT 1 FROM "campaigns" c WHERE c."sender_user_id" = "users"."id" AND c."tenant_id" = "users"."tenant_id" AND c."status" IN ('running', 'paused'))`;
  // 0 rows: gone, or a campaign of this sender was approved after the check above (the guard in the UPDATE, Vanda #216-1).
  if (rows === 0) {
    const locked = await lockedBy(input.userId);
    if (!locked) return { error: "Felhasználó nem található" };
    if (changed) return { error: lockedError(locked) };
    return { ok: true as const, phone };
  }
  audit("user", input.userId, "update", { phone: current }, { phone });
  revalidatePath("/campaigns", "layout");
  revalidatePath("/settings/profile");
  return { ok: true as const, phone };
}

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

  const cur = await db.user.findFirst({ where: { id: userId, tenantId: TENANT_ID }, select: { name: true, settings: true } });
  const changed = cur?.name !== p.name || phoneOf(cur?.settings) !== p.phone;
  if (changed) {
    const locked = await lockedBy(userId);
    if (locked) return { error: lockedError(locked) };
  }

  const rows = p.phone == null
    ? await db.$executeRaw`
        UPDATE "users" SET "name" = ${p.name}, "settings" = COALESCE("settings", '{}'::jsonb) - 'phone'
         WHERE "id" = ${userId} AND "tenant_id" = ${TENANT_ID}
           AND NOT EXISTS (SELECT 1 FROM "campaigns" c WHERE c."sender_user_id" = "users"."id" AND c."tenant_id" = "users"."tenant_id" AND c."status" IN ('running', 'paused'))`
    : await db.$executeRaw`
        UPDATE "users" SET "name" = ${p.name},
               "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), ARRAY['phone'], ${JSON.stringify(p.phone)}::jsonb, true)
         WHERE "id" = ${userId} AND "tenant_id" = ${TENANT_ID}
           AND NOT EXISTS (SELECT 1 FROM "campaigns" c WHERE c."sender_user_id" = "users"."id" AND c."tenant_id" = "users"."tenant_id" AND c."status" IN ('running', 'paused'))`;
  if (rows === 0) {
    const locked = await lockedBy(userId);
    if (!locked) return { error: NOT_A_CRM_USER };
    if (changed) return { error: lockedError(locked) };
    return { ok: true as const };
  }

  audit("user", userId, "update", null, { name: p.name, phone: p.phone });
  revalidatePath("/campaigns", "layout");
  revalidatePath("/settings");
  revalidatePath("/settings/profile");
  return { ok: true as const };
}
