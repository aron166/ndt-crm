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
const cache = new Map<string, { ok: boolean; at: number }>();

export async function isCrmUserEmail(tenantId: number, rawEmail: string | null | undefined): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (!email) return false;
  const key = `${tenantId}:${email}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ok;
  const users = await db.user.findMany({ where: { tenantId }, select: { email: true } });
  const ok = users.some((u) => normalizeEmail(u.email) === email);
  cache.set(key, { ok, at: Date.now() });
  return ok;
}
