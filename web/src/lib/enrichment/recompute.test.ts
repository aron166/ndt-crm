import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { recomputeCloseness } from "./recompute";

// recomputeCloseness never throws (the write that triggered it already
// succeeded) and every query it issues must be tenant-scoped.

const { db: mockDb } = vi.hoisted(() => ({
  db: {
    interaction: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
    company: { updateMany: vi.fn() },
    person: { updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.interaction.findMany.mockResolvedValue([]);
  mockDb.invoice.findMany.mockResolvedValue([]);
  mockDb.company.updateMany.mockResolvedValue({ count: 1 });
  mockDb.person.updateMany.mockResolvedValue({ count: 1 });
});

describe("recomputeCloseness", () => {
  it("scopes every company-branch query by tenant", async () => {
    await recomputeCloseness({ tenantId: 1, companyId: 7 });
    expect(mockDb.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 1, companyId: 7 } }),
    );
    expect(mockDb.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 1, companyId: 7 }) }),
    );
  });

  it("company branch writes a number via company.updateMany", async () => {
    await recomputeCloseness({ tenantId: 1, companyId: 7 });
    expect(mockDb.company.updateMany).toHaveBeenCalledTimes(1);
    const call = mockDb.company.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 7, tenantId: 1 });
    expect(typeof call.data.closenessScore).toBe("number");
  });

  it("person branch runs with no invoice query", async () => {
    await recomputeCloseness({ tenantId: 1, personId: 3 });
    expect(mockDb.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 1, personId: 3 } }),
    );
    expect(mockDb.invoice.findMany).not.toHaveBeenCalled();
    expect(mockDb.person.updateMany).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the db rejects", async () => {
    mockDb.interaction.findMany.mockRejectedValue(new Error("db down"));
    await expect(recomputeCloseness({ tenantId: 1, companyId: 7 })).resolves.toBeUndefined();
    expect(mockDb.company.updateMany).not.toHaveBeenCalled();
  });
});
