import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { TENANT_ID } from "./tenant";
import { reportError } from "./report-error";
import { createClient } from "./supabase/server";

export type AuditAction = "create" | "update" | "delete";

// The audit invariant: every audited mutation must use one of these entity types.
// Adding a new audited entity? Add it here — the type checker then forces every
// call site to be honest about what it is logging (this is exactly the guard that
// was missing when deal events were filed under "task").
export type AuditEntityType =
  | "company" | "person" | "contact"
  | "task" | "interaction" | "tag" | "tagging"
  | "deal" | "lead" | "proposal" | "invoice" | "quote"
  | "equipment" | "integration_credential" | "custom_field"
  | "automation_rule"
  | "campaign" | "content_item" | "content_version" | "content_review" | "email_draft"
  | "cost_rate" | "suppression"
  // Tenant-level config (tenants.settings — e.g. the setter question list).
  | "tenant";

// Who performed the mutation. Users come from the Supabase session; agents/system
// callers (the ingestion API, future hub writes) must attribute themselves explicitly.
export type AuditActor = "user" | "agent" | "system";

export interface AuditOptions {
  // Tenant the mutated entity belongs to. Defaults to TENANT_ID.
  // TODO(ctx): derive from AppContext instead of accepting per-call.
  tenantId?: number;
  // Set when the caller is an agent/system actor rather than a Supabase user.
  // Populates the audit_log.actor_agent_id column.
  actorAgentId?: string;
  // Hint for which actor performed the write. When "user" (default) we look up
  // the Supabase session; for "agent"/"system" we skip the session lookup.
  actor?: AuditActor;
}

interface WriteAuditInput {
  entityType: AuditEntityType;
  entityId: number;
  action: AuditAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  options: AuditOptions;
}

type AuditClient = { auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown> } };

// The actual persistence step. Extracted from `audit()` so it can be unit-tested
// directly (the `after()` callback in `audit()` only runs inside a request).
// This is the single write path for the audit trail; a write that must be atomic
// with its mutation passes the transaction client.
export async function writeAuditLog(input: WriteAuditInput, client: AuditClient = db): Promise<void> {
  const { entityType, entityId, action, before, after: after_data, options } = input;
  const tenantId = options.tenantId ?? TENANT_ID;
  const actor = options.actor ?? "user";

  let actorUserId: string | null = null;
  // Only consult the Supabase session for user-initiated mutations. Agent/system
  // callers run outside a user session and attribute themselves via actorAgentId.
  if (actor === "user") {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    actorUserId = data.user?.id ?? null;
  }

  await client.auditLog.create({
    data: {
      tenantId,
      actorUserId,
      actorAgentId: options.actorAgentId ?? null,
      action,
      entityType,
      entityId,
      changes: JSON.parse(JSON.stringify({ before, after: after_data })),
    },
  });
}

// Records an audited mutation. Runs after the response is sent — never blocks the
// main operation. Audit failures are logged with structured context (so holes in
// the trail are observable) but are intentionally never re-thrown.
export function audit(
  entityType: AuditEntityType,
  entityId: number,
  action: AuditAction,
  before: Record<string, unknown> | null,
  after_data: Record<string, unknown> | null,
  options: AuditOptions = {},
) {
  after(async () => {
    try {
      await writeAuditLog({ entityType, entityId, action, before, after: after_data, options });
    } catch (err) {
      // Audit failures must never break the main operation, but they MUST be
      // observable — a silently swallowed failure is an undetectable hole in the
      // trail (a compliance problem for e.g. legally-binding quote approvals).
      reportError("audit", err, {
        entityType,
        entityId,
        action,
        tenantId: options.tenantId ?? TENANT_ID,
        actorAgentId: options.actorAgentId ?? null,
      });
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
