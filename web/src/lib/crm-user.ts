import { db } from "./db";
import { normalizeEmail } from "./email";

/**
 * Is this login email a CRM user of the tenant? `users` is the allow-list
 * (Supabase signups are open). Used by the proxy on every request, so it is
 * cached per server instance for a minute.
 * ponytail: in-memory TTL cache; a removed user keeps access for up to 60 s on a
 * warm instance. Use a shared cache or a DB flag check if that ever matters.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { userId: number | null; at: number }>();

/**
 * The CRM `users.id` for a login email, or null. Cached per server instance for
 * a minute, so the proxy AND getActor cost one query per instance per minute
 * instead of one per request (2026-09-17 query pass).
 */
export async function crmUserIdForEmail(tenantId: number, rawEmail: string | null | undefined): Promise<number | null> {
  const email = normalizeEmail(rawEmail);
  if (!email) return null;
  const key = `${tenantId}:${email}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.userId;
  // ponytail: users is a handful of rows — compare normalized in memory rather
  // than storing a normalized column.
  const users = await db.user.findMany({ where: { tenantId }, select: { id: true, email: true } });
  const userId = users.find((u) => normalizeEmail(u.email) === email)?.id ?? null;
  cache.set(key, { userId, at: Date.now() });
  return userId;
}

export async function isCrmUserEmail(tenantId: number, rawEmail: string | null | undefined): Promise<boolean> {
  return (await crmUserIdForEmail(tenantId, rawEmail)) !== null;
}
