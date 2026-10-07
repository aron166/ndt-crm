import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: { contentItem: { findFirst: vi.fn() }, contentCheck: { createMany: vi.fn() }, $transaction: vi.fn() },
}));
import { db } from "@/lib/db";
import { addChecks } from "./service";

describe("addChecks with tx", () => {
  it("uses the given tx for lookup, insert and audit, never db", async () => {
    const tx = {
      contentItem: { findFirst: vi.fn().mockResolvedValue({ id: 4 }) },
      contentCheck: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const r = await addChecks({ tenantId: 1, kind: "app", appSlug: "x" }, 4, [{ question: "Mehet?" }], tx as never);
    expect(r).toEqual({ ok: true, created: 1 });
    expect(tx.contentItem.findFirst).toHaveBeenCalled();
    expect(tx.contentCheck.createMany).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(db.contentItem.findFirst).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
