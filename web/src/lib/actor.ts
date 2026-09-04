import { db } from "./db";
import { createClient } from "./supabase/server";
import type { LeadCtx } from "./leads/service";

// Who is acting, as a `users` row id (the FK interactions.user_id /
// tasks.assigned_to_id need). Supabase Auth is the identity source; the `users`
// table is the CRM-side allow-list. A signed-in email that is NOT already a CRM
// user is rejected — signups are enabled on Supabase, so anyone could register
// and must not land in tenant 1 (Codex review 2026-09-04, Batch A #1). Invite
// flow today = Áron inserts the users row; RBAC later.
export interface Actor {
  userId: number | null;
  email: string | null;
}

export async function getActor(tenantId: number): Promise<Actor> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.trim().toLowerCase() ?? null;
  if (!email) return { userId: null, email: null };
  const user = await db.user.findFirst({ where: { tenantId, email }, select: { id: true } });
  return { userId: user?.id ?? null, email };
}

export const NOT_A_CRM_USER = "Ez a fiók nincs felvéve CRM-felhasználóként — kérj hozzáférést Árontól.";

/** Ctx for a signed-in user acting through the UI (server actions). */
export async function userLeadCtx(tenantId: number): Promise<LeadCtx | { error: string }> {
  const { userId } = await getActor(tenantId);
  if (userId == null) return { error: NOT_A_CRM_USER };
  return { tenantId, userId, actor: "user" };
}
