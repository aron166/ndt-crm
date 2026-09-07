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

/**
 * Canonical form for matching a login email against `users.email`: trimmed,
 * lowercased; for Gmail (gmail.com / googlemail.com) dots and +tags in the local
 * part are dropped, because Gmail delivers `balogh.aron16+x@` and `balogharon16@`
 * to the same mailbox and Áron signs in with both spellings.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = raw?.trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  const [local, domain] = e.split("@");
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`;
  }
  return `${local}@${domain}`;
}

export async function getActor(tenantId: number): Promise<Actor> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = normalizeEmail(data.user?.email);
  if (!email) return { userId: null, email: null };
  // ponytail: users is a handful of rows per tenant — compare in memory rather than
  // storing a normalized column. Add `users.email_normalized` if the table grows.
  const users = await db.user.findMany({ where: { tenantId }, select: { id: true, email: true } });
  const user = users.find((u) => normalizeEmail(u.email) === email);
  return { userId: user?.id ?? null, email };
}

export const NOT_A_CRM_USER = "Ez a fiók nincs felvéve CRM-felhasználóként — kérj hozzáférést Árontól.";

/** Ctx for a signed-in user acting through the UI (server actions). */
export async function userLeadCtx(tenantId: number): Promise<LeadCtx | { error: string }> {
  const { userId } = await getActor(tenantId);
  if (userId == null) return { error: NOT_A_CRM_USER };
  return { tenantId, userId, actor: "user" };
}
