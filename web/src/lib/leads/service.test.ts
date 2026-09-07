import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { changeLeadStatus, logLeadCallOutcome, completeOpenLeadCallTasks, type LeadCtx } from "./service";

// The task ↔ kanban sync (Péter, BRIEFING addendum 2026-09-07 P0 #4). Both
// directions, plus the "duplication structurally impossible" claim.

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/automations/engine", () => ({ runAutomations: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./queries", () => ({
  getLeadStatuses: vi.fn().mockResolvedValue(
    ["new", "call_1", "call_2", "call_3", "call_3_plus", "recall", "demo_aron", "demo_peter"]
      .map((key, position) => ({ key, label: key, color: "#000", position, isInitial: position === 0, isTerminal: false, isCommitment: false, description: null })),
  ),
  getQualificationQuestions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db", () => ({
  db: {
    lead: { findFirst: vi.fn(), updateMany: vi.fn() },
    task: { updateMany: vi.fn(), create: vi.fn() },
    user: { findFirst: vi.fn() },
    interaction: { create: vi.fn() },
    company: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const mockDb = db as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const ctx: LeadCtx = { tenantId: 1, userId: 2, actor: "user" };

const LEAD = {
  status: "call_1", outcome: "open", companyId: 7, source: null, serviceInterest: null,
  estimatedValue: null, convertedDealId: null, assignedToId: null, lostReason: null,
  channel: null, company: { name: "Acme Kft." },
  contact: { personId: 3, person: { firstName: "Anna", lastName: "Kiss" } },
};

let txTaskUpdateMany: ReturnType<typeof vi.fn>;
let txTaskCreate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.lead.findFirst.mockResolvedValue(LEAD);
  mockDb.lead.updateMany.mockResolvedValue({ count: 1 });
  mockDb.task.updateMany.mockResolvedValue({ count: 1 });
  txTaskUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  txTaskCreate = vi.fn().mockResolvedValue({ id: 99 });
  mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      interaction: { create: vi.fn().mockResolvedValue({ id: 55 }) },
      task: { updateMany: txTaskUpdateMany, create: txTaskCreate },
      lead: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      company: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    }),
  );
});

describe("card → task: moving the card completes the open callback task", () => {
  it("completes open call tasks on a normal stage move", async () => {
    const res = await changeLeadStatus(10, "call_2", ctx);
    expect(res).toEqual({ success: true, changed: true });
    expect(mockDb.task.updateMany).toHaveBeenCalledTimes(1);
    expect(mockDb.task.updateMany.mock.calls[0][0]).toMatchObject({
      where: { tenantId: 1, leadId: 10, type: "call", status: { in: ["created", "in_progress"] } },
      data: { status: "done" },
    });
  });

  it("does NOT complete them when moving INTO recall — that IS the reminder", async () => {
    await changeLeadStatus(10, "recall", ctx);
    expect(mockDb.task.updateMany).not.toHaveBeenCalled();
  });

  it("a no-op move touches no task", async () => {
    const res = await changeLeadStatus(10, "call_1", ctx);
    expect(res).toEqual({ success: true, changed: false });
    expect(mockDb.task.updateMany).not.toHaveBeenCalled();
  });

  it("an unknown status is rejected before anything is written", async () => {
    expect(await changeLeadStatus(10, "nope", ctx)).toEqual({ error: "Ismeretlen státusz" });
    expect(mockDb.lead.updateMany).not.toHaveBeenCalled();
    expect(mockDb.task.updateMany).not.toHaveBeenCalled();
  });
});

describe("task → card: logging a call cannot leave two open callback tasks", () => {
  it("closes the old callback BEFORE creating the new one, in one transaction", async () => {
    const res = await logLeadCallOutcome(10, {
      outcome: "callback_requested", note: "kedden", callbackAt: "2026-09-10T10:00:00Z",
    }, ctx);
    expect(res).toMatchObject({ success: true, status: "recall", taskId: 99 });
    expect(txTaskUpdateMany).toHaveBeenCalledTimes(1);
    expect(txTaskCreate).toHaveBeenCalledTimes(1);
    const closeOrder = txTaskUpdateMany.mock.invocationCallOrder[0];
    const createOrder = txTaskCreate.mock.invocationCallOrder[0];
    expect(closeOrder).toBeLessThan(createOrder);
  });

  it("an outcome with no callback closes the open task and creates none", async () => {
    const res = await logLeadCallOutcome(10, { outcome: "no_answer", note: "nem vette fel" }, ctx);
    expect(res).toMatchObject({ success: true, status: "call_2" });
    expect(txTaskUpdateMany).toHaveBeenCalledTimes(1);
    expect(txTaskCreate).not.toHaveBeenCalled();
  });
});

describe("completeOpenLeadCallTasks is the single shared query", () => {
  it("scopes by tenant, lead, type and open status, and returns the count", async () => {
    const tx = { task: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) } };
    const now = new Date("2026-09-07T10:00:00Z");
    expect(await completeOpenLeadCallTasks(tx as never, 42, 1, now)).toBe(3);
    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 1, leadId: 42, type: "call", status: { in: ["created", "in_progress"] } },
      data: { status: "done", completedAt: now },
    });
  });
});
