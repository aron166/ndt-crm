import { describe, it, expect } from "vitest";
import { callOutcomeSchema, planCallOutcome, callbackTone, daysSince, bookingIssue } from "./outcomes";
import { DEFAULT_TRANSITIONS, type LifecycleLead } from "./lifecycle";

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
  it("meeting_booked needs demoWith; booking fields are optional but come as a pair", () => {
    expect(parse({ outcome: "meeting_booked", note: "ok" }).success).toBe(false);
    // The pre-2026-09-12 API payload still parses (Kai ruling 2026-09-17).
    expect(parse({ outcome: "meeting_booked", note: "ok", demoWith: "peter" }).success).toBe(true);
    expect(parse({ outcome: "meeting_booked", note: "ok", demoWith: "peter", bookingAt: "2026-09-10T10:00:00Z" }).success).toBe(false);
    expect(parse({ outcome: "meeting_booked", note: "ok", demoWith: "peter", bookingKind: "job" }).success).toBe(false);
    expect(parse({ outcome: "no_answer", note: "ok", bookingAt: "2026-09-10T10:00:00Z", bookingKind: "job" }).success).toBe(false);
    expect(parse({
      outcome: "meeting_booked", note: "ok", demoWith: "peter",
      bookingAt: "2026-09-10T10:00:00Z", bookingKind: "single_machine_demo",
    }).success).toBe(true);
  });
  it("not_interested / disqualified need a real lost reason, not just the key", () => {
    expect(parse({ outcome: "not_interested", note: "n" }).success).toBe(false);
    expect(parse({ outcome: "disqualified", note: "n", lostReason: "  " }).success).toBe(false);
    expect(parse({ outcome: "not_interested", note: "n", lostReason: "xy" }).success).toBe(false);
    expect(parse({ outcome: "not_interested", note: "n", lostReason: "Van saját szkennerük" }).success).toBe(true);
  });
  it("a lost reason on a non-lost outcome is simply ignored, not an error", () => {
    expect(parse({ outcome: "no_answer", note: "n", lostReason: "akármi" }).success).toBe(true);
  });
  it("rejects unknown outcomes", () => {
    expect(parse({ outcome: "interested", note: "x" }).success).toBe(false);
  });
});

describe("bookingIssue — who must book a date", () => {
  const now = new Date("2026-09-17T10:00:00Z");
  const future = new Date("2026-09-18T08:00:00Z");
  it("a UI user must give a date for meeting_booked", () => {
    expect(bookingIssue({ outcome: "meeting_booked" }, "user", now)?.path).toBe("bookingAt");
    expect(bookingIssue({ outcome: "meeting_booked", bookingAt: future }, "user", now)).toBeNull();
  });
  it("an API caller keeps the old contract — no date is fine", () => {
    expect(bookingIssue({ outcome: "meeting_booked" }, "agent", now)).toBeNull();
  });
  it("nobody may book into the past", () => {
    const past = new Date("2026-09-17T09:59:00Z");
    expect(bookingIssue({ outcome: "meeting_booked", bookingAt: past }, "user", now)).not.toBeNull();
    expect(bookingIssue({ outcome: "meeting_booked", bookingAt: past }, "agent", now)).not.toBeNull();
  });
  it("ignores other outcomes", () => {
    expect(bookingIssue({ outcome: "no_answer" }, "user", now)).toBeNull();
  });
});

describe("planCallOutcome", () => {
  const now = new Date("2026-09-07T10:00:00Z");
  const day0 = new Date("2026-09-01T10:00:00Z");
  const lead = (status: string | null, extra: Partial<LifecycleLead> = {}): LifecycleLead => ({
    status, attempts: 0, assignedToId: 1, offerType: null, nextAction: null, nextDue: null, statusEnteredAt: day0, ...extra,
  });
  const p = (outcome: string, l: LifecycleLead, extra: Record<string, unknown> = {}) =>
    planCallOutcome(callOutcomeSchema.parse({ outcome, note: "n", ...extra }), l, DEFAULT_TRANSITIONS, now);

  it("no_answer from new: contacting, attempt 1, email task + attempt-2 cadence task 3.5 h after day 0", () => {
    const plan = p("no_answer", lead("new"));
    expect(plan.transition).toMatchObject({ from: "new", to: "contacting" });
    expect(plan.input.attempts).toBe(1);
    expect(plan.input.tasks?.map((t) => t.type)).toEqual(["email", "call"]);
    expect(plan.input.tasks?.[1].dueDate.getTime()).toBe(now.getTime() + 3.5 * 3_600_000);
    expect(plan.input.nextDue).toEqual(plan.input.tasks?.[1].dueDate);
  });
  it("no_answer from contacting at 3 attempts: self transition, attempt 4, next = cadence step 5 at entered + 7 d", () => {
    const plan = p("no_answer", lead("contacting", { attempts: 3 }));
    expect(plan.transition).toMatchObject({ from: "contacting", to: "contacting", event: "call_no_answer" });
    expect(plan.input.attempts).toBe(4);
    expect(plan.input.nextDue?.getTime()).toBe(day0.getTime() + 7 * 86_400_000);
    expect(plan.input.tasks).toHaveLength(1);
  });
  it("no_answer at attempts 7 fires attempts_exhausted -> recall", () => {
    const plan = p("no_answer", lead("contacting", { attempts: 7 }));
    expect(plan.transition).toMatchObject({ event: "attempts_exhausted", to: "recall" });
    expect(plan.input.attempts).toBe(8);
  });
  it("callback_requested from contacting -> recall (timing, date = callbackAt), no plain callback", () => {
    const plan = p("callback_requested", lead("contacting"), { callbackAt: "2026-09-10T10:00:00Z" });
    expect(plan.transition?.to).toBe("recall");
    expect(plan.input.recallReason).toBe("timing");
    expect(plan.input.recallDate?.toISOString()).toBe("2026-09-10T10:00:00.000Z");
    expect(plan.callbackAt).toBeNull();
  });
  it("callback_requested from a stage with no row keeps a plain callback task", () => {
    const plan = p("callback_requested", lead("qualified"), { callbackAt: "2026-09-10T10:00:00Z" });
    expect(plan.transition).toBeNull();
    expect(plan.callbackAt?.toISOString()).toBe("2026-09-10T10:00:00.000Z");
  });
  it("meeting_booked: contacting -> discovery_booked, offer_sent -> demo_booked, due = bookingAt", () => {
    const extra = { demoWith: "peter", bookingAt: "2026-09-10T10:00:00Z", bookingKind: "single_machine_demo" };
    const a = p("meeting_booked", lead("contacting"), extra);
    expect(a.transition?.to).toBe("discovery_booked");
    expect(a.input.nextDue?.toISOString()).toBe("2026-09-10T10:00:00.000Z");
    expect(a.bookingAt?.toISOString()).toBe("2026-09-10T10:00:00.000Z");
    expect(a.bookingKind).toBe("single_machine_demo");
    expect(p("meeting_booked", lead("offer_sent"), extra).transition?.to).toBe("demo_booked");
  });
  it("lost outcomes carry the default code and the typed text as note", () => {
    const a = p("not_interested", lead("contacting"), { lostReason: "Van saját szkennerük" });
    expect(a.transition?.to).toBe("lost");
    expect(a.input.lostReason).toBe("no_need");
    expect(a.input.lostNote).toBe("Van saját szkennerük");
    expect(p("disqualified", lead("new"), { lostReason: "Nincs betonszerkezetük" }).input.lostReason).toBe("unqualified");
    expect(p("wrong_number", lead("new")).input.lostReason).toBe("invalid_contact");
  });
  it("an explicit lostCode overrides the default", () => {
    expect(p("not_interested", lead("new"), { lostReason: "drága", lostCode: "price" }).input.lostReason).toBe("price");
  });
  it("an outcome whose event has no row from the stage only logs the call", () => {
    expect(p("no_answer", lead("ordered")).transition).toBeNull();
  });

  it("a lost outcome past the call stages closes through lead_lost (Vanda #2)", () => {
    const plan = p("wrong_number", lead("recall"));
    expect(plan.transition).toMatchObject({ from: "recall", event: "lead_lost", to: "lost" });
    expect(plan.input.lostReason).toBe("invalid_contact");
    expect(p("not_interested", lead("offer_sent"), { lostReason: "no budget now" }).transition?.event).toBe("lead_lost");
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

describe("existingBookingTaskId (booked in the lead page drawer)", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  it("a user may log meeting_booked without a date when the drawer already booked it", () => {
    expect(bookingIssue({ outcome: "meeting_booked", bookingAt: undefined, existingBookingTaskId: 5 }, "user", now)).toBeNull();
    expect(bookingIssue({ outcome: "meeting_booked", bookingAt: undefined }, "user", now)?.path).toBe("bookingAt");
  });
  it("the schema does not demand demoWith when the booking task exists", () => {
    expect(callOutcomeSchema.safeParse({ outcome: "meeting_booked", note: "ok", existingBookingTaskId: 5 }).success).toBe(true);
    expect(callOutcomeSchema.safeParse({ outcome: "meeting_booked", note: "ok" }).success).toBe(false);
  });
});
