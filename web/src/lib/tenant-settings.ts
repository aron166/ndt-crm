import { db } from "@/lib/db";

/**
 * Write ONE key of `tenants.settings` without touching its neighbours.
 *
 * `/leads/setup` renders several editors over the same JSON blob (the setter
 * questions + intro link, the call-script variants, whatever comes next). A
 * read-modify-write loses whichever save lands second: it spreads the blob it
 * read before the other one committed and silently reverts it. `jsonb_set` does
 * the merge inside Postgres (one `||` per patch), so the editors can never clobber each other.
 *
 * Returns the PREVIOUS value of the key, for the audit entry.
 */
export async function setTenantSettings(
  tenantId: number,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const before = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const beforeSettings = (before?.settings as Record<string, unknown> | null) ?? {};

  if (Object.keys(patch).length === 0) return {};
  // ONE statement for the whole patch, so it lands whole or not at all. `||` merges the
  // top-level keys inside Postgres (no read-modify-write); a settings value that is SQL NULL
  // or JSON null (or any non-object) is treated as {}. undefined is written as null.
  const json = JSON.stringify(Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? null])));
  await db.$executeRaw`
    UPDATE "tenants"
       SET "settings" = (CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END) || ${json}::jsonb
     WHERE "id" = ${tenantId}`;

  return Object.fromEntries(Object.keys(patch).map((k) => [k, beforeSettings[k] ?? null]));
}
