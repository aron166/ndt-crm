import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// The entity references a hub record (event, conversation) may carry, and the
// two ways a bad one is refused. Shared so both ingest routes refuse alike.

export interface HubRefs {
  agentId?: number | null;
  personId?: number | null;
  companyId?: number | null;
}

/**
 * Every referenced entity must belong to the key's tenant: a foreign id is a
 * caller bug (or a probe), never a cross-tenant write. Agents are portfolio-global.
 */
export async function hubRefsInTenant(tenantId: number, refs: HubRefs): Promise<boolean> {
  const found = await Promise.all([
    refs.agentId ? db.agent.findFirst({ where: { id: refs.agentId }, select: { id: true } }) : true,
    refs.personId ? db.person.findFirst({ where: { id: refs.personId, tenantId, deletedAt: null }, select: { id: true } }) : true,
    refs.companyId ? db.company.findFirst({ where: { id: refs.companyId, tenantId, deletedAt: null }, select: { id: true } }) : true,
  ]);
  return found.every(Boolean);
}

export const FOREIGN_REF_ERROR = "Unknown agentId, personId, or companyId for this tenant";
/** P2003 on create: the reference vanished between the check and the write. */
export const MISSING_REF_ERROR = "Unknown agentId, personId, or companyId reference";

export function isMissingRef(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003";
}
