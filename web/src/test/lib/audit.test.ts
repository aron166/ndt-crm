import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────
// writeAuditLog persists via db.auditLog.create and (for user actors) reads the
// Supabase session. We mock both so the write path is observable in a unit test.

const auditCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    auditLog: { create: (args: unknown) => auditCreate(args) },
  },
}));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
}));

import { diff, writeAuditLog } from "@/lib/audit";

beforeEach(() => {
  auditCreate.mockReset();
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-abc" } } });
});

describe("diff", () => {
  it("returns empty diffs for identical objects", () => {
    const result = diff({ title: "foo", status: "created" }, { title: "foo", status: "created" });
    expect(result.before).toEqual({});
    expect(result.after).toEqual({});
  });

  it("returns only changed fields", () => {
    const result = diff(
      { title: "old", status: "created", type: "call" },
      { title: "new", status: "in_progress", type: "call" }
    );
    expect(result.before).toEqual({ title: "old", status: "created" });
    expect(result.after).toEqual({ title: "new", status: "in_progress" });
  });

  it("ignores updatedAt and createdAt", () => {
    const result = diff(
      { title: "x", updatedAt: "2026-01-01", createdAt: "2026-01-01" },
      { title: "x", updatedAt: "2026-05-12", createdAt: "2026-01-01" }
    );
    expect(result.before).toEqual({});
    expect(result.after).toEqual({});
  });

  it("handles null vs value transitions", () => {
    const result = diff({ dueDate: null }, { dueDate: "2026-06-01" });
    expect(result.before).toEqual({ dueDate: null });
    expect(result.after).toEqual({ dueDate: "2026-06-01" });
  });

  it("detects new fields in after", () => {
    const result = diff({ title: "x" }, { title: "x", description: "added" });
    expect(result.after).toEqual({ description: "added" });
  });
});

describe("writeAuditLog", () => {
  it("persists entityType, action and entityId verbatim", async () => {
    await writeAuditLog({
      entityType: "deal",
      entityId: 42,
      action: "create",
      before: null,
      after: { title: "Big deal" },
      options: {},
    });

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const data = auditCreate.mock.calls[0][0].data;
    expect(data.entityType).toBe("deal");
    expect(data.entityId).toBe(42);
    expect(data.action).toBe("create");
    expect(data.changes).toEqual({ before: null, after: { title: "Big deal" } });
  });

  it("defaults tenantId to 1 and captures the Supabase user for user actors", async () => {
    await writeAuditLog({
      entityType: "company",
      entityId: 1,
      action: "update",
      before: { name: "a" },
      after: { name: "b" },
      options: {},
    });

    const data = auditCreate.mock.calls[0][0].data;
    expect(data.tenantId).toBe(1);
    expect(data.actorUserId).toBe("user-abc");
    expect(data.actorAgentId).toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("honours an explicit tenantId override", async () => {
    await writeAuditLog({
      entityType: "person",
      entityId: 7,
      action: "delete",
      before: { firstName: "x" },
      after: null,
      options: { tenantId: 99 },
    });

    expect(auditCreate.mock.calls[0][0].data.tenantId).toBe(99);
  });

  it("attributes agent actors via actorAgentId and skips the user session lookup", async () => {
    await writeAuditLog({
      entityType: "lead",
      entityId: 5,
      action: "create",
      before: null,
      after: { source: "birdsview" },
      options: { actor: "agent", actorAgentId: "agent-7", tenantId: 2 },
    });

    const data = auditCreate.mock.calls[0][0].data;
    expect(data.actorAgentId).toBe("agent-7");
    expect(data.actorUserId).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("does not consult the session for system actors", async () => {
    await writeAuditLog({
      entityType: "integration_credential",
      entityId: 3,
      action: "update",
      before: null,
      after: { isActive: true },
      options: { actor: "system" },
    });

    expect(getUser).not.toHaveBeenCalled();
    expect(auditCreate.mock.calls[0][0].data.actorUserId).toBeNull();
  });

  it("accepts every entity type in the union", async () => {
    const types = [
      "company", "person", "contact", "task", "interaction", "tag", "tagging",
      "deal", "lead", "proposal", "invoice", "equipment",
      "integration_credential", "custom_field",
    ] as const;

    for (const t of types) {
      await writeAuditLog({ entityType: t, entityId: 1, action: "create", before: null, after: {}, options: {} });
    }
    expect(auditCreate).toHaveBeenCalledTimes(types.length);
  });
});
