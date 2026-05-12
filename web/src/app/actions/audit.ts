"use server";

import { db } from "@/lib/db";
import type { AuditEntityType } from "@/lib/audit";

const TENANT_ID = 1;

export async function getEntityHistory(type: AuditEntityType, id: number) {
  return db.auditLog.findMany({
    where: { tenantId: TENANT_ID, entityType: type, entityId: id },
    orderBy: { occurredAt: "desc" },
    take: 100,
  });
}
