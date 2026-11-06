import type { Prisma } from "@prisma/client";

type StatusReader = {
  leadStatus: { findFirst(args: Prisma.LeadStatusFindFirstArgs): Promise<{ key: string } | null> };
};

/** Key of the tenant's entry column, where new leads land; "new" when none is flagged. */
export async function initialStatusKey(client: StatusReader, tenantId: number): Promise<string> {
  const initial = await client.leadStatus.findFirst({
    where: { tenantId, isInitial: true },
    orderBy: { position: "asc" },
    select: { key: true },
  });
  return initial?.key ?? "new";
}
