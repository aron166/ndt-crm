import { after } from "next/server";
import { db } from "./db";
import { createClient } from "./supabase/server";

const TENANT_ID = 1;

export type AuditAction = "create" | "update" | "delete";
export type AuditEntityType =
  | "company" | "person" | "contact"
  | "task" | "interaction" | "tag" | "tagging";

// Runs after the response is sent — never blocks the main operation
export function audit(
  entityType: AuditEntityType,
  entityId: number,
  action: AuditAction,
  before: Record<string, unknown> | null,
  after_data: Record<string, unknown> | null,
) {
  after(async () => {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      await db.auditLog.create({
        data: {
          tenantId: TENANT_ID,
          actorUserId: user?.id ?? null,
          action,
          entityType,
          entityId,
          changes: JSON.parse(JSON.stringify({ before: before, after: after_data })),
        },
      });
    } catch {
      // Audit failures must never break the main operation
    }
  });
}

// Compute a flat diff between two objects — only changed keys
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (key === "updatedAt" || key === "createdAt") continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changedBefore[key] = before[key];
      changedAfter[key] = after[key];
    }
  }
  return { before: changedBefore, after: changedAfter };
}
