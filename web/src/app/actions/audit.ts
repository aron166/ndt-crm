"use server";

import { db } from "@/lib/db";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import type { AuditEntityType } from "@/lib/audit";

const TENANT_ID = 1;

// Same gate as tasks.ts / automations.ts. Returns the MESSAGE, not an
// `{ error }` object, so each action builds its own literal (keeps TypeScript's
// union normalisation intact for call sites).
async function requireUser(): Promise<string | null> {
  const { userId } = await getActor(TENANT_ID);
  return userId == null ? NOT_A_CRM_USER : null;
}

export async function getEntityHistory(type: AuditEntityType, id: number) {
  const denied = await requireUser();
  if (denied) throw new Error(denied);
  return db.auditLog.findMany({
    where: { tenantId: TENANT_ID, entityType: type, entityId: id },
    orderBy: { occurredAt: "desc" },
    take: 100,
  });
}
