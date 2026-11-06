import { db } from "@/lib/db";

/** Closed union: the key is spliced into the SQL as a bound parameter path, never raw text. */
export type DailySendKey = "contentDigestLastSentOn" | "weeklyReportLastSentOn";

/** Atomically claim `ymd` on the tenant settings row. True only for the caller that flipped it from "not today". */
export async function claimDailySend(tenantId: number, key: DailySendKey, ymd: string): Promise<boolean> {
  const claimed = await db.$executeRaw`
    UPDATE "tenants"
       SET "settings" = jsonb_set(
             CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
             ARRAY[${key}]::text[], to_jsonb(${ymd}::text), true)
     WHERE "id" = ${tenantId}
       AND COALESCE("settings"->>${key}::text, '') <> ${ymd}`;
  return claimed > 0;
}
