import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "@prisma/client";
import { runIdleAutomations } from "./idle";
import { db } from "@/lib/db";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    automationRule: { findMany: vi.fn(), update: vi.fn() },
    deal: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const mockDb = db as unknown as {
  automationRule: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  deal: { findMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

function idleRule(over: Record<string, unknown> = {}) {
  return {
    id: 1, tenantId: 1, triggerType: "deal_idle_in_stage", isActive: true,
    triggerConfig: { idleDays: 7 }, conditions: null,
    actionType: "create_task", actionConfig: { titleTemplate: "Tétlen deal: {company}" },
    ...over,
  };
}

function idleDeal(over: Record<string, unknown> = {}) {
  return {
    id: 5, companyId: 1, personId: 2, value: null, stageId: 3,
    stageEnteredAt: new Date("2026-01-01T00:00:00.000Z"),
    company: { name: "Acme Kft." },
    ...over,
  };
}

describe("runIdleAutomations", () => {
  let firingCreate: ReturnType<typeof vi.fn>;
  let taskCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    firingCreate = vi.fn().mockResolvedValue({});
    taskCreate = vi.fn().mockResolvedValue({});
    mockDb.automationRule.update.mockResolvedValue({});
    // Default: run the transaction callback against in-memory mocks.
    mockDb.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ automationFiring: { create: firingCreate }, task: { create: taskCreate } }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a task + firing for an idle deal", async () => {
    mockDb.automationRule.findMany.mockResolvedValue([idleRule()]);
    mockDb.deal.findMany.mockResolvedValue([idleDeal()]);

    const res = await runIdleAutomations(new Date("2026-06-07T00:00:00.000Z"));

    expect(res).toEqual({ rulesEvaluated: 1, tasksCreated: 1 });
    expect(firingCreate).toHaveBeenCalledOnce();
    expect(taskCreate).toHaveBeenCalledOnce();
    expect(mockDb.automationRule.update).toHaveBeenCalledWith({
      where: { id: 1 }, data: { lastRunAt: expect.any(Date) },
    });
  });

  it("scopes the deal query by stage + idle cutoff", async () => {
    mockDb.automationRule.findMany.mockResolvedValue([idleRule({ triggerConfig: { idleDays: 10, stageId: 4 } })]);
    mockDb.deal.findMany.mockResolvedValue([]);

    await runIdleAutomations(new Date("2026-06-07T00:00:00.000Z"));

    const where = mockDb.deal.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe(1);
    expect(where.stageId).toBe(4);
    expect(where.stageEnteredAt.lte).toEqual(new Date("2026-05-28T00:00:00.000Z")); // 10 days before
  });

  it("treats a duplicate firing (P2002) as already-fired and skips", async () => {
    mockDb.automationRule.findMany.mockResolvedValue([idleRule()]);
    mockDb.deal.findMany.mockResolvedValue([idleDeal()]);
    mockDb.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
    );

    const res = await runIdleAutomations(new Date("2026-06-07T00:00:00.000Z"));
    expect(res.tasksCreated).toBe(0);
  });

  it("skips deals that fail the rule's conditions", async () => {
    mockDb.automationRule.findMany.mockResolvedValue([
      idleRule({ conditions: [{ field: "value", op: "gt", value: 1_000_000 }] }),
    ]);
    mockDb.deal.findMany.mockResolvedValue([idleDeal({ value: null })]); // null < threshold → fails

    const res = await runIdleAutomations(new Date("2026-06-07T00:00:00.000Z"));
    expect(res.tasksCreated).toBe(0);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("skips rules with a non-positive idleDays without querying deals", async () => {
    mockDb.automationRule.findMany.mockResolvedValue([idleRule({ triggerConfig: { idleDays: 0 } })]);

    const res = await runIdleAutomations(new Date("2026-06-07T00:00:00.000Z"));
    expect(res.tasksCreated).toBe(0);
    expect(mockDb.deal.findMany).not.toHaveBeenCalled();
  });
});
