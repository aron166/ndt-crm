"use server";

import { db } from "@/lib/db";
import { requireCrmUser } from "@/lib/actor";
import type { AuditEntityType } from "@/lib/audit";

const TENANT_ID = 1;

export async function getEntityHistory(type: AuditEntityType, id: number) {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) throw new Error(denied);
  return db.auditLog.findMany({
    where: { tenantId: TENANT_ID, entityType: type, entityId: id },
    orderBy: { occurredAt: "desc" },
    take: 100,
  });
}
