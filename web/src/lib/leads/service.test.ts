import type { AnswerSources } from "./qualification";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { changeLeadStatus, logLeadCallOutcome, completeOpenLeadCallTasks, setLeadQualification, type LeadCtx } from "./service";
import { resolveDemoHost, loadBookings } from "@/lib/booking/queries";

// The task ↔ kanban sync (Péter, BRIEFING addendum 2026-09-07 P0 #4). Both
// directions, plus the "duplication structurally impossible" claim.

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/automations/engine", () => ({ runAutomations: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/booking/queries", () => ({
  resolveDemoHost: vi.fn().mockResolvedValue(null),
  loadBookings: vi.fn().mockResolvedValue([]),
}));
vi.mock("./queries", () => ({
  getLeadStatuses: vi.fn().mockResolvedValue(
    ["new", "call_1", "call_2", "call_3", "call_3_plus", "recall", "demo_aron", "demo_peter"]
      .map((key, position) => ({ key, label: key, color: "#000", position, isInitial: position === 0, isTerminal: false, isCommitment: false, description: null })),
  ),
  getQualificationQuestions: vi.fn().mockResolvedValue(
    [
      "gate", "situation", "concrete", "goal", "size", "postcode", "timing",
      "own_device", "hook", "use_case", "work",
    ].map((slug) => ({ slug, label: slug })),
  ),
  getScriptVariants: vi.fn().mockResolvedValue([{ key: "a", label: "A", body: "" }]),
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

type M = ReturnType<typeof vi.fn>;
const mockDb = db as unknown as {
  lead: { findFirst: M; updateMany: M };
  task: { updateMany: M; create: M };
  $transaction: M;
};
const ctx: LeadCtx = { tenantId: 1, userId: 2, actor: "user" };
const agentCtx: LeadCtx = { tenantId: 1, userId: null, actor: "agent" };
const mockResolveDemoHost = resolveDemoHost as unknown as M;
const mockLoadBookings = loadBookings as unknown as M;

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

  it("an unknown scriptVariant is rejected and no interaction row is created", async () => {
    const res = await logLeadCallOutcome(10, {
      outcome: "no_answer", note: "nem vette fel", scriptVariant: "does_not_exist",
    }, ctx);
    expect(res).toEqual({ error: "Ismeretlen szkriptváltozat: does_not_exist" });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});

describe("setLeadQualification keeps a placed tier when the new answer doesn't re-place it", () => {
  /** The `data` of the one lead.updateMany the call made. */
  function written() {
    expect(mockDb.lead.updateMany).toHaveBeenCalledTimes(1);
    return mockDb.lead.updateMany.mock.calls[0][0] as {
      where: object;
      data: { qualification: Record<string, string>; tier: string; answerSources: AnswerSources };
    };
  }

  it("keeps tier A when the derived tier is null (not yet placeable)", async () => {
    mockDb.lead.findFirst.mockResolvedValue({ qualification: {}, answerSources: null, tier: "A" });
    const res = await setLeadQualification(10, { hook: "erdekel a technologia" }, ctx);
    expect(res).toEqual({ success: true });
    const call = written();
    expect(call.where).toEqual({ id: 10, tenantId: 1 });
    expect(call.data.qualification).toEqual({ hook: "erdekel a technologia" });
    expect(call.data.tier).toBe("A");
  });

  it("overwrites tier A with C when the new answer derives a tier", async () => {
    mockDb.lead.findFirst.mockResolvedValue({ qualification: {}, answerSources: null, tier: "A" });
    const res = await setLeadQualification(10, { situation: "szakember" }, ctx);
    expect(res).toEqual({ success: true });
    const call = written();
    expect(call.data.qualification).toEqual({ situation: "szakember" });
    expect(call.data.tier).toBe("C");
  });

  it("records the answer as the SETTER's and leaves the form's answer intact", async () => {
    mockDb.lead.findFirst.mockResolvedValue({
      qualification: { situation: "ceg" },
      answerSources: { situation: { form: { value: "ceg", at: "2026-09-20T10:00:00.000Z", set: "rovid" } } },
      tier: "B",
    });
    const res = await setLeadQualification(10, { situation: "szakember" }, ctx);
    expect(res).toEqual({ success: true });
    const call = written();
    // The form said "ceg" and still does; the setter's answer is the current one.
    expect(call.data.answerSources.situation?.form?.value).toBe("ceg");
    expect(call.data.answerSources.situation?.setter?.value).toBe("szakember");
    expect(call.data.qualification).toEqual({ situation: "szakember" });
    expect(call.data.tier).toBe("C");
  });

  it("a blank setter answer falls back to the form answer, it does not clear it", async () => {
    mockDb.lead.findFirst.mockResolvedValue({
      qualification: { situation: "szakember" },
      answerSources: {
        situation: {
          form: { value: "ceg", at: "2026-09-20T10:00:00.000Z" },
          setter: { value: "szakember", at: "2026-09-20T11:00:00.000Z" },
        },
      },
      tier: "C",
    });
    const res = await setLeadQualification(10, { situation: "" }, ctx);
    expect(res).toEqual({ success: true });
    const call = written();
    expect(call.data.answerSources.situation?.setter).toBeUndefined();
    expect(call.data.qualification).toEqual({ situation: "ceg" });
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

describe("logLeadCallOutcome — bookings", () => {
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

  it("user ctx, meeting_booked without bookingAt: rejected with issues.bookingAt, no task created", async () => {
    const res = await logLeadCallOutcome(10, {
      outcome: "meeting_booked", note: "demo egyeztetve", demoWith: "aron",
    }, ctx);
    expect(res).toMatchObject({ issues: { bookingAt: expect.any(Array) } });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(txTaskCreate).not.toHaveBeenCalled();
  });

  it("agent ctx, meeting_booked with demoWith only (old API payload): succeeds, no booking task, host never resolved", async () => {
    const res = await logLeadCallOutcome(10, {
      outcome: "meeting_booked", note: "demo egyeztetve", demoWith: "aron",
    }, agentCtx);
    expect(res).toMatchObject({ success: true, bookingTaskId: null, bookingConflicts: [] });
    expect(mockResolveDemoHost).not.toHaveBeenCalled();
    expect(txTaskCreate).not.toHaveBeenCalled();
  });

  it("agent ctx, bookingAt in the past: rejected", async () => {
    const res = await logLeadCallOutcome(10, {
      outcome: "meeting_booked", note: "demo egyeztetve", demoWith: "aron",
      bookingAt: inDays(-3).toISOString(), bookingKind: "single_machine_demo",
    }, agentCtx);
    expect(res).toMatchObject({ issues: { bookingAt: expect.any(Array) } });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("user ctx, valid future booking: booking task goes to the resolved host, not ctx.userId", async () => {
    mockResolveDemoHost.mockResolvedValueOnce(3);
    const bookingAt = inDays(3);
    const res = await logLeadCallOutcome(10, {
      outcome: "meeting_booked", note: "demo egyeztetve", demoWith: "aron",
      bookingAt: bookingAt.toISOString(), bookingKind: "single_machine_demo",
    }, ctx);
    expect(txTaskCreate).toHaveBeenCalledTimes(1);
    expect(txTaskCreate.mock.calls[0][0]).toMatchObject({
      data: expect.objectContaining({
        assignedToId: 3,
        startsAt: bookingAt,
        bookingKind: "single_machine_demo",
      }),
    });
    expect(res).toMatchObject({ success: true, bookingTaskId: 99 });
  });

  it("resolveDemoHost returns null: rejected mentioning demoHosts, no transaction run", async () => {
    mockResolveDemoHost.mockResolvedValueOnce(null);
    const res = await logLeadCallOutcome(10, {
      outcome: "meeting_booked", note: "demo egyeztetve", demoWith: "peter",
      bookingAt: inDays(3).toISOString(), bookingKind: "single_machine_demo",
    }, ctx);
    expect(res).toMatchObject({ error: expect.stringContaining("demoHosts") });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("an overlapping existing booking is flagged as a conflict with the existing side movable", async () => {
    mockResolveDemoHost.mockResolvedValueOnce(3);
    const bookingAt = inDays(3);
    mockLoadBookings.mockResolvedValueOnce([
      { id: 501, title: "Magánszemély látogatás", startsAt: bookingAt, minutes: 90, assignedToId: 3, kind: "private", dealValue: null, estimatedValue: null, point: null },
    ]);
    const res = await logLeadCallOutcome(10, {
      outcome: "meeting_booked", note: "demo egyeztetve", demoWith: "aron",
      bookingAt: bookingAt.toISOString(), bookingKind: "multi_unit_demo",
    }, ctx);
    expect(res).toMatchObject({ success: true });
    if (!("success" in res)) throw new Error("expected success");
    expect(res.bookingConflicts).toHaveLength(1);
    expect(res.bookingConflicts[0]).toMatchObject({ taskId: 501, movable: "existing" });
  });

  it("loadBookings throwing still leaves the call saved, with no conflicts reported", async () => {
    mockResolveDemoHost.mockResolvedValueOnce(3);
    mockLoadBookings.mockRejectedValueOnce(new Error("db down"));
    const res = await logLeadCallOutcome(10, {
      outcome: "meeting_booked", note: "demo egyeztetve", demoWith: "aron",
      bookingAt: inDays(3).toISOString(), bookingKind: "single_machine_demo",
    }, ctx);
    expect(res).toMatchObject({ success: true, bookingConflicts: [] });
  });
});
