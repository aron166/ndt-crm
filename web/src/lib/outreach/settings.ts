import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// tenants.settings.outreachReplyTo / outreachFooter: the one reader. Callers
// gate auth themselves; this only knows where the values live.

export interface OutreachSettings {
  replyTo: string | null;
  footer: string | null;
}

export async function readOutreachSettings(
  tenantId: number,
  client: Pick<Prisma.TransactionClient, "tenant"> = db,
): Promise<OutreachSettings> {
  const tenant = await client.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const s = (tenant?.settings as Record<string, unknown> | null) ?? {};
  return {
    replyTo: typeof s.outreachReplyTo === "string" ? s.outreachReplyTo : null,
    footer: typeof s.outreachFooter === "string" ? s.outreachFooter : null,
  };
}
