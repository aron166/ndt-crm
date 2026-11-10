import type { AnswerSources } from "./qualification";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { changeLeadStatus, logLeadCallOutcome, completeOpenLeadCallTasks, setLeadQualification, setLeadOutcome, type LeadCtx } from "./service";
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
  getLeadTransitions: vi.fn().mockImplementation(async () => (await vi.importActual<typeof import("./lifecycle")>("./lifecycle")).DEFAULT_TRANSITIONS),
  getLeadStatuses: vi.fn().mockResolvedValue(
    ["new", "contacting", "discovery_booked", "qualified", "offer_sent", "demo_booked", "demo_done", "ordered", "won", "recall", "lost"]
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
    task: { updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    interaction: { create: vi.fn() },
    company: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

type M = ReturnType<typeof vi.fn>;
const mockDb = db as unknown as {
  lead: { findFirst: M; updateMany: M };
  task: { updateMany: M; create: M; findFirst: M };
  $transaction: M;
};
const ctx: LeadCtx = { tenantId: 1, userId: 2, actor: "user" };
const agentCtx: LeadCtx = { tenantId: 1, userId: null, actor: "agent" };
const mockResolveDemoHost = resolveDemoHost as unknown as M;
const mockLoadBookings = loadBookings as unknown as M;

const LEAD = {
  status: "contacting", outcome: "open", companyId: 7, source: null, serviceInterest: null,
  estimatedValue: null, convertedDealId: null, assignedToId: 5, attempts: 1, offerType: null,
  nextAction: "2. hívás", nextDue: new Date("2026-09-08T10:00:00Z"), statusEnteredAt: new Date("2026-09-07T10:00:00Z"), lostReason: null,
  channel: null, company: { name: "Acme Kft." },
  contact: { personId: 3, person: { firstName: "Anna", lastName: "Kiss" } },
};

let txTaskUpdateMany: ReturnType<typeof vi.fn>;
let txTaskCreate: ReturnType<typeof vi.fn>;
let txLeadUpdateMany: ReturnType<typeof vi.fn>;
let txHistoryCreate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.lead.findFirst.mockResolvedValue(LEAD);
  mockDb.lead.updateMany.mockResolvedValue({ count: 1 });
  mockDb.task.updateMany.mockResolvedValue({ count: 1 });
  txTaskUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  txTaskCreate = vi.fn().mockResolvedValue({ id: 99 });
  txLeadUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  txHistoryCreate = vi.fn().mockResolvedValue({ id: 1 });
  mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      interaction: { create: vi.fn().mockResolvedValue({ id: 55 }) },
      task: { updateMany: txTaskUpdateMany, create: txTaskCreate },
      lead: { updateMany: txLeadUpdateMany },
      leadStatusHistory: { create: txHistoryCreate },
      company: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    }),
  );
});

describe("card → task: moving the card completes the open callback task", () => {
  it("completes open call tasks on a normal stage move", async () => {
    const res = await changeLeadStatus(10, "qualified", ctx, { offerType: "service" });
    expect(res).toEqual({ success: true, changed: true });
    expect(txTaskUpdateMany.mock.calls[0][0]).toMatchObject({
      where: { tenantId: 1, leadId: 10, type: "call", status: { in: ["created", "in_progress"] } },
      data: { status: "done" },
    });
  });

  it("does NOT complete them when moving INTO recall — that IS the reminder", async () => {
    const res = await changeLeadStatus(10, "recall", ctx);
    expect(res).toEqual({ success: true, changed: true });
    expect(txTaskUpdateMany.mock.calls.some((c) => c[0].where.type === "call")).toBe(false);
  });

  it("a no-op move touches no task", async () => {
    const res = await changeLeadStatus(10, "contacting", ctx);
    expect(res).toEqual({ success: true, changed: false });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("an unknown status is rejected before anything is written", async () => {
    expect(await changeLeadStatus(10, "nope", ctx)).toEqual({ error: "Ismeretlen státusz" });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});

describe("changeLeadStatus: the transition table and the open-lead rule", () => {
  it("refuses a move that is not in the table (new -> won) and writes nothing", async () => {
    mockDb.lead.findFirst.mockResolvedValue({ ...LEAD, status: "new" });
    const res = await changeLeadStatus(10, "won", ctx);
    expect(res).toMatchObject({ error: expect.stringContaining("Nem engedélyezett lépés") });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(txHistoryCreate).not.toHaveBeenCalled();
  });

  it("contacting -> discovery_booked needs a next action and due date (no entry task)", async () => {
    const res = await changeLeadStatus(10, "discovery_booked", ctx);
    expect(res).toMatchObject({ error: expect.stringContaining("következő lépés") });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    const ok = await changeLeadStatus(10, "discovery_booked", ctx, { nextAction: "Egyeztetés", nextDue: new Date("2026-09-20T10:00:00Z") });
    expect(ok).toEqual({ success: true, changed: true });
    expect(txLeadUpdateMany.mock.calls[0][0].data).toMatchObject({ status: "discovery_booked", nextAction: "Egyeztetés" });
  });

  it("writes one history row with from / to / event and the actor", async () => {
    await changeLeadStatus(10, "qualified", ctx, { offerType: "rental" });
    expect(txHistoryCreate).toHaveBeenCalledTimes(1);
    expect(txHistoryCreate.mock.calls[0][0].data).toMatchObject({
      tenantId: 1, leadId: 10, fromStatus: "contacting", toStatus: "qualified", event: "call_qualified", actorUserId: 2,
    });
    expect(txTaskCreate.mock.calls[0][0].data).toMatchObject({ setMembership: ["w2_lifecycle"] });
  });

  it("moving to lost needs a code; other needs a note too; other + note closes the lead as lost", async () => {
    expect(await changeLeadStatus(10, "lost", ctx)).toMatchObject({ error: expect.any(String) });
    expect(await changeLeadStatus(10, "lost", ctx, { lostReason: "other" })).toMatchObject({ error: expect.any(String) });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    const ok = await changeLeadStatus(10, "lost", ctx, { lostReason: "other", lostNote: "kiderült: bérbeadó" });
    expect(ok).toEqual({ success: true, changed: true });
    expect(txLeadUpdateMany.mock.calls[0][0].data).toMatchObject({
      status: "lost", outcome: "lost", lostReason: "other", lostNote: "kiderült: bérbeadó", nextAction: null,
    });
  });
});

describe("task → card: logging a call cannot leave two open callback tasks", () => {
  it("closes the old callback BEFORE creating the new one, in one transaction", async () => {
    const res = await logLeadCallOutcome(10, {
      outcome: "callback_requested", note: "kedden", callbackAt: "2026-09-10T10:00:00Z",
    }, ctx);
    // A callback with a table row (contacting -> recall) plans a recall task via the lifecycle writer, not a plain callback.
    expect(res).toMatchObject({ success: true, status: "recall", taskId: null });
    expect(txTaskUpdateMany.mock.calls[0][0].where.type).toBe("call");
    expect(txTaskCreate).toHaveBeenCalledTimes(1);
    const closeOrder = txTaskUpdateMany.mock.invocationCallOrder[0];
    const createOrder = txTaskCreate.mock.invocationCallOrder[0];
    expect(closeOrder).toBeLessThan(createOrder);
  });

  it("an outcome with no plain callback closes the open task and only creates lifecycle cadence tasks", async () => {
    const res = await logLeadCallOutcome(10, { outcome: "no_answer", note: "nem vette fel" }, ctx);
    expect(res).toMatchObject({ success: true, status: "contacting", taskId: null });
    expect(txTaskUpdateMany.mock.calls[0][0].where.type).toBe("call");
    expect(txTaskCreate).toHaveBeenCalledTimes(1);
    expect(txTaskCreate.mock.calls[0][0].data).toMatchObject({ setMembership: ["w2_lifecycle"] });
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

  it("blanking a setter answer with NO form answer clears it, it does not resurrect as legacy", async () => {
    // Vanda #113: computing `legacy` from the POST-write sources re-labelled the
    // setter's own text as an origin-less answer the moment they deleted it, so
    // the value survived in `qualification` AND reappeared on the lead under
    // "forrás ismeretlen".
    mockDb.lead.findFirst.mockResolvedValue({
      qualification: { size: "300" },
      answerSources: { size: { setter: { value: "300", at: "2026-09-20T11:00:00.000Z" } } },
      tier: "B",
    });
    const res = await setLeadQualification(10, { size: "" }, ctx);
    expect(res).toEqual({ success: true });
    const call = written();
    expect(call.data.qualification).toEqual({});
    expect(call.data.answerSources.size).toBeUndefined();
  });

  it("a legacy answer (no provenance at all) can be cleared, and the write actually happens", async () => {
    mockDb.lead.findFirst.mockResolvedValue({
      qualification: { size: "200" },
      answerSources: null,
      tier: "B",
    });
    const res = await setLeadQualification(10, { size: "" }, ctx);
    expect(res).toEqual({ success: true });
    const call = written();
    expect(call.data.qualification).toEqual({});
  });

  it("a legacy answer on an UNSUBMITTED slug survives a save to another slug", async () => {
    mockDb.lead.findFirst.mockResolvedValue({
      qualification: { size: "200" },
      answerSources: null,
      tier: null,
    });
    const res = await setLeadQualification(10, { situation: "szakember" }, ctx);
    expect(res).toEqual({ success: true });
    const call = written();
    expect(call.data.qualification).toEqual({ size: "200", situation: "szakember" });
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

  it("existingBookingTaskId: logs against the drawer's meeting, no second task, scoped lookup", async () => {
    const startsAt = inDays(2);
    mockDb.task.findFirst.mockResolvedValueOnce({ assignedToId: 7, startsAt, dueDate: startsAt });
    const res = await logLeadCallOutcome(10, { outcome: "meeting_booked", note: "foglalva", existingBookingTaskId: 55 }, ctx);
    expect(res).toMatchObject({ success: true });
    expect(mockDb.task.findFirst.mock.calls[0][0].where).toMatchObject({ id: 55, tenantId: ctx.tenantId, leadId: 10, type: "meeting" });
    expect(txTaskCreate).not.toHaveBeenCalled();
  });

  it("existingBookingTaskId of another lead, tenant or a done meeting: rejected, nothing written", async () => {
    mockDb.task.findFirst.mockResolvedValueOnce(null);
    const res = await logLeadCallOutcome(10, { outcome: "meeting_booked", note: "foglalva", existingBookingTaskId: 99 }, ctx);
    expect(res).toMatchObject({ error: expect.any(String) });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("user ctx, meeting_booked without bookingAt: rejected with issues.bookingAt, no task created", async () => {
    const res = await logLeadCallOutcome(10, {
      outcome: "meeting_booked", note: "demo egyeztetve", demoWith: "aron",
    }, ctx);
    expect(res).toMatchObject({ issues: { bookingAt: expect.any(Array) } });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(txTaskCreate).not.toHaveBeenCalled();
  });

  it("agent ctx, meeting_booked with demoWith only (old API payload): succeeds, no booking task, host resolved once for the owner", async () => {
    const res = await logLeadCallOutcome(10, {
      outcome: "meeting_booked", note: "demo egyeztetve", demoWith: "aron",
    }, agentCtx);
    expect(res).toMatchObject({ success: true, bookingTaskId: null, bookingConflicts: [] });
    expect(mockResolveDemoHost).toHaveBeenCalledTimes(1);
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

// Áron 2026-11-09: "lostra állításnál technikailag nem tudta elmenteni" and
// "hívás eredménye lezártnál nem nyílik meg".
describe("lost flow (fix/crm-lost-flow)", () => {
  it("bug 1: re-closing a lead whose stored reason is 'other' keeps its note and saves", async () => {
    // Already lost, reason other + note: the old code passed "other" without its note.
    mockDb.lead.findFirst.mockResolvedValue({ ...LEAD, status: "lost", outcome: "lost", lostReason: "other", lostNote: "test" });
    const res = await setLeadOutcome(10, "lost", ctx, null);
    expect(res).toEqual({ success: true, dealId: undefined });
    expect(mockDb.lead.updateMany.mock.calls[0][0].data).toMatchObject({ lostReason: "other", lostNote: "test" });
  });

  it("bug 1: closing with a Hungarian label stores the key, no note needed", async () => {
    const res = await setLeadOutcome(10, "lost", ctx, "Nem ez kell neki");
    expect(res).toEqual({ success: true });
    const move = txLeadUpdateMany.mock.calls.find((c) => c[0].data.status === "lost")![0];
    expect(move.data).toMatchObject({ outcome: "lost", lostReason: "not_our_service", lostNote: null });
  });

  it("bug 1: free text closes as 'other' with the text as note; nothing at all is a clear error", async () => {
    expect(await setLeadOutcome(10, "lost", ctx, "nem válaszol sehol")).toEqual({ success: true });
    const move = txLeadUpdateMany.mock.calls.find((c) => c[0].data.status === "lost")![0];
    expect(move.data).toMatchObject({ lostReason: "other", lostNote: "nem válaszol sehol" });
    expect(await setLeadOutcome(10, "lost", ctx, null)).toEqual({ error: "Válaszd ki, miért veszett el a lead" });
  });

  it("reopen clears the old closing reason", async () => {
    mockDb.lead.findFirst.mockResolvedValue({ ...LEAD, status: "lost", outcome: "lost", lostReason: "other", lostNote: "test" });
    expect(await setLeadOutcome(10, "open", ctx)).toEqual({ success: true });
    const move = txLeadUpdateMany.mock.calls.find((c) => c[0].data.status === "new")![0];
    expect(move.data).toMatchObject({ outcome: "open", closedAt: null, lostReason: null, lostNote: null });
  });

  it("bug 2: a lost lead can log a call; stage, tasks and next action stay", async () => {
    mockDb.lead.findFirst.mockResolvedValue({ ...LEAD, status: "lost", outcome: "lost", lostReason: "no_need" });
    const res = await logLeadCallOutcome(10, { outcome: "no_answer", note: "visszahívtam, nem vette fel" }, ctx);
    expect(res).toMatchObject({ success: true, status: "lost", outcome: "lost", taskId: null });
    expect(txHistoryCreate).not.toHaveBeenCalled();
    expect(txTaskCreate).not.toHaveBeenCalled();
    expect(txLeadUpdateMany).not.toHaveBeenCalled();
  });

  it("a callback or booking on a lost lead is refused, so the auto paths file a confirm task (Vanda #159-1)", async () => {
    mockDb.lead.findFirst.mockResolvedValue({ ...LEAD, status: "lost", outcome: "lost", lostReason: "no_need" });
    const res = await logLeadCallOutcome(10, { outcome: "callback_requested", note: "kérte", callbackAt: "2026-12-01T09:00:00Z" }, ctx);
    expect(res).toMatchObject({ error: expect.stringContaining("előbb nyisd újra") });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("the reported flow: an OPEN lead with a stale 'other' and no typed reason gets a clear error, not the stale code (Vanda #159-2)", async () => {
    mockDb.lead.findFirst.mockResolvedValue({ ...LEAD, lostReason: "other", lostNote: null });
    expect(await setLeadOutcome(10, "lost", ctx, null)).toEqual({ error: "Válaszd ki, miért veszett el a lead" });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("a lost lead whose stored reason is legacy free text re-closes as other with that text as note (Vanda #159-4)", async () => {
    mockDb.lead.findFirst.mockResolvedValue({ ...LEAD, status: "lost", outcome: "lost", lostReason: "Nincs keret idén", lostNote: null });
    expect(await setLeadOutcome(10, "lost", ctx, null)).toEqual({ success: true, dealId: undefined });
    expect(mockDb.lead.updateMany.mock.calls[0][0].data).toMatchObject({ lostReason: "other", lostNote: "Nincs keret idén" });
  });

  it("bug 2: a converted (won) lead still refuses a call log", async () => {
    mockDb.lead.findFirst.mockResolvedValue({ ...LEAD, status: "won", outcome: "won", convertedDealId: 9 });
    const res = await logLeadCallOutcome(10, { outcome: "no_answer", note: "x" }, ctx);
    expect(res).toMatchObject({ error: "A lead már lezárt: előbb nyisd újra" });
  });
});
