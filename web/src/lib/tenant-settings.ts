import { db } from "@/lib/db";

/**
 * Write ONE key of `tenants.settings` without touching its neighbours.
 *
 * `/leads/setup` renders several editors over the same JSON blob (the setter
 * questions + intro link, the call-script variants, whatever comes next). A
 * read-modify-write loses whichever save lands second: it spreads the blob it
 * read before the other one committed and silently reverts it. `jsonb_set` does
 * the merge inside Postgres, so the two editors can never clobber each other.
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

  for (const [key, value] of Object.entries(patch)) {
    // jsonb_set needs a literal path; the key is ours (never user input), but
    // pass it as a parameter anyway so it can never be spliced into SQL.
    await db.$executeRaw`
      UPDATE "tenants"
         SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), ARRAY[${key}], ${JSON.stringify(value ?? null)}::jsonb, true)
       WHERE "id" = ${tenantId}`;
  }

  return Object.fromEntries(Object.keys(patch).map((k) => [k, beforeSettings[k] ?? null]));
}
