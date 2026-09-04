import { describe, it, expect } from "vitest";
import { callOutcomeSchema, planCallOutcome, callbackTone, daysSince } from "./outcomes";
import { DEFAULT_LEAD_STATUSES } from "./statuses";

const KEYS = DEFAULT_LEAD_STATUSES.map((s) => s.key);
const parse = (v: unknown) => callOutcomeSchema.safeParse(v);

describe("callOutcomeSchema — the shared rules", () => {
  it("blocks save without a note", () => {
    expect(parse({ outcome: "no_answer", note: "   " }).success).toBe(false);
    expect(parse({ outcome: "no_answer" }).success).toBe(false);
  });
  it("callback_requested needs an explicit datetime", () => {
    expect(parse({ outcome: "callback_requested", note: "hívj" }).success).toBe(false);
    expect(parse({ outcome: "callback_requested", note: "hívj", callbackAt: "not-a-date" }).success).toBe(false);
    expect(parse({ outcome: "callback_requested", note: "hívj", callbackAt: "2026-09-10T10:00:00Z" }).success).toBe(true);
  });
  it("meeting_booked needs demoWith", () => {
    expect(parse({ outcome: "meeting_booked", note: "ok" }).success).toBe(false);
    expect(parse({ outcome: "meeting_booked", note: "ok", demoWith: "peter" }).success).toBe(true);
  });
  it("rejects unknown outcomes", () => {
    expect(parse({ outcome: "interested", note: "x" }).success).toBe(false);
  });
});

describe("planCallOutcome", () => {
  const p = (outcome: string, status: string | null, extra: Record<string, unknown> = {}) =>
    planCallOutcome(callOutcomeSchema.parse({ outcome, note: "n", ...extra }), status, KEYS);

  it("no_answer walks new → call_1 → … → call_3_plus and stops", () => {
    expect(p("no_answer", "new").status).toBe("call_1");
    expect(p("no_answer", "call_1").status).toBe("call_2");
    expect(p("no_answer", "call_3").status).toBe("call_3_plus");
    expect(p("no_answer", "call_3_plus").status).toBeNull();
    expect(p("no_answer", "recall").status).toBeNull();
  });
  it("callback → recall + task date", () => {
    const plan = p("callback_requested", "call_1", { callbackAt: "2026-09-10T10:00:00Z" });
    expect(plan.status).toBe("recall");
    expect(plan.callbackAt?.toISOString()).toBe("2026-09-10T10:00:00.000Z");
  });
  it("meeting_booked → demo column of the chosen person", () => {
    expect(p("meeting_booked", "call_2", { demoWith: "peter" }).status).toBe("demo_peter");
    expect(p("meeting_booked", "demo_aron", { demoWith: "aron" }).status).toBeNull();
  });
  it("not_interested / disqualified close as lost with the key as reason", () => {
    expect(p("not_interested", "call_1").lost).toEqual({ lostReason: "not_interested" });
    expect(p("disqualified", "new").lost).toEqual({ lostReason: "disqualified" });
    expect(p("wrong_number", "new")).toEqual({ status: null, lost: null, callbackAt: null });
  });
  it("never moves into a column the tenant removed", () => {
    const plan = planCallOutcome(
      callOutcomeSchema.parse({ outcome: "callback_requested", note: "n", callbackAt: "2026-09-10T10:00:00Z" }),
      "call_1", ["new", "call_1"],
    );
    expect(plan.status).toBeNull();
    expect(plan.callbackAt).not.toBeNull();
  });
});

describe("card helpers", () => {
  const now = new Date("2026-09-04T12:00:00Z");
  it("callbackTone", () => {
    expect(callbackTone(null, now)).toBeNull();
    expect(callbackTone("2026-09-04T11:00:00Z", now)).toBe("overdue");
    expect(callbackTone("2026-09-05T11:00:00Z", now)).toBe("soon");
    expect(callbackTone("2026-09-06T11:00:00Z", now)).toBeNull();
  });
  it("daysSince", () => {
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("2026-09-01T12:00:00Z", now)).toBe(3);
    expect(daysSince("2026-09-04T13:00:00Z", now)).toBe(0);
  });
});
