import { db } from "./db";
import { createClient } from "./supabase/server";

// Who is acting, as a `users` row id (the FK interactions.user_id / tasks.assigned_to_id
// need). Supabase Auth is the identity source; the `users` table is the CRM-side
// profile. ponytail: a signed-in Supabase user with no `users` row is provisioned
// on first touch (name = email local part, role member) — no admin UI for users yet;
// Áron promotes roles in the DB until one exists.
export interface Actor {
  userId: number | null;
  email: string | null;
}

export async function getActor(tenantId: number): Promise<Actor> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.trim().toLowerCase() ?? null;
  if (!email) return { userId: null, email: null };

  const existing = await db.user.findFirst({ where: { tenantId, email }, select: { id: true } });
  if (existing) return { userId: existing.id, email };

  const created = await db.user.create({
    data: { tenantId, email, name: email.split("@")[0], passwordHash: "supabase-auth", role: "member" },
    select: { id: true },
  });
  return { userId: created.id, email };
}

/** Ctx for a signed-in user acting through the UI (server actions). */
export async function userLeadCtx(tenantId: number): Promise<import("./leads/service").LeadCtx> {
  const { userId } = await getActor(tenantId);
  return { tenantId, userId, actor: "user" };
}
