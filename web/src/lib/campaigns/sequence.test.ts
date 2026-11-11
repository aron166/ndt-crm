// Item 4: the engine follows the edited sequence (conditions, waits in working days, replies, bounces, promotion, mid-run edits).
import { describe, it, expect } from "vitest";
import { localDay } from "@/lib/booking/time";
import { planOutcome, selectDailyList, stepsFitKind, conditionHolds, nextApplicable, remapAfterEdit, approvalHash, type StepDef } from "./rules";

const FRI = localDay(new Date("2026-11-13T10:00:00Z")); // a Friday in Budapest
const seq: StepDef[] = [
  { position: 1, channel: "email", waitDays: 0, audienceRule: "all" },
  { position: 2, channel: "email", waitDays: 2, audienceRule: "no_reply" },
  { position: 3, channel: "call", waitDays: 2, audienceRule: "no_reply" },
  { position: 4, channel: "call", waitDays: 0, audienceRule: "replied" },
  { position: 5, channel: "email", waitDays: 3, audienceRule: "no_answer" },
];
const m = (over: Partial<Parameters<typeof planOutcome>[0]> = {}) => ({ state: "queued" as const, stepPosition: 1, attempts: 0, hasPhone: true, replied: false, ...over });

describe("conditions (no reply yet, replied, previous call not answered; opened is not available)", () => {
  it("each condition reads the member's history", () => {
    expect(conditionHolds("all", { replied: true, lastCallOutcome: null })).toBe(true);
    expect(conditionHolds("no_reply", { replied: false, lastCallOutcome: null })).toBe(true);
    expect(conditionHolds("no_reply", { replied: true, lastCallOutcome: null })).toBe(false);
    expect(conditionHolds("replied", { replied: true, lastCallOutcome: null })).toBe(true);
    expect(conditionHolds("no_answer", { replied: false, lastCallOutcome: "no_answer" })).toBe(true);
    expect(conditionHolds("no_answer", { replied: false, lastCallOutcome: null })).toBe(false);
    expect(conditionHolds("opened", { replied: false, lastCallOutcome: null })).toBe(false); // unknown rule fails closed
  });
  it("the next applicable step skips the ones whose condition does not hold", () => {
    expect(nextApplicable(seq, 3, { replied: false, lastCallOutcome: "no_answer" })?.position).toBe(5);
    expect(nextApplicable(seq, 1, { replied: false, lastCallOutcome: null })?.position).toBe(2);
  });
});

describe("the engine follows the edited sequence", () => {
  it("a wait counts working days across a weekend: sent Friday, 2 working days = Tuesday", () => {
    const p = planOutcome(m({ stepPosition: 1 }), "email_sent", seq, FRI);
    expect(p).toMatchObject({ member: { stepPosition: 2, nextEligibleOn: "2026-11-17", state: "queued" } });
  });
  it("a reply stops later e-mail steps and moves the member to the call step for repliers", () => {
    const p = planOutcome(m({ stepPosition: 2 }), "reply_positive", seq, FRI);
    expect(p).toMatchObject({ member: { stepPosition: 4, state: "queued", nextEligibleOn: "2026-11-13" }, promote: null });
  });
  it("without a call step for repliers a reply promotes, as before (Áron: first call within the hour)", () => {
    const p = planOutcome(m({ stepPosition: 1 }), "reply_positive", seq.slice(0, 3), FRI);
    expect(p).toMatchObject({ member: { state: "promoted" }, promote: { sla: true } });
  });
  it("a bounce goes to needs_email and is never called instead", () => {
    const p = planOutcome(m({ stepPosition: 1 }), "bounce", seq, FRI);
    expect(p).toMatchObject({ member: { state: "needs_email" }, suppress: true });
    expect(selectDailyList([{ id: 1, state: "needs_email", stepPosition: 3, nextEligibleOn: null, priority: 0, city: null, lastTouchedAt: null }], new Set([3, 4]), 15, new Date("2026-11-13T10:00:00Z")).ids).toEqual([]);
  });
  it("a member promoted to a lead leaves the prospect sequence", () => {
    const p = planOutcome(m({ stepPosition: 3 }), "interested", seq, FRI);
    expect(p).toMatchObject({ member: { state: "promoted" } });
    expect(planOutcome(m({ state: "promoted", stepPosition: 3 }), "email_sent", seq, FRI)).toMatchObject({ error: expect.any(String) });
    expect(selectDailyList([{ id: 1, state: "promoted", stepPosition: 3, nextEligibleOn: null, priority: 0, city: null, lastTouchedAt: null }], new Set([3]), 15, new Date("2026-11-13T10:00:00Z")).ids).toEqual([]);
  });
  it("unanswered calls move to the no-answer follow-up instead of unreachable when the sequence has one", () => {
    const p = planOutcome(m({ stepPosition: 3, attempts: 2 }), "no_answer", seq, FRI);
    expect(p).toMatchObject({ member: { stepPosition: 5, attempts: 0, state: "queued", nextEligibleOn: "2026-11-18" } });
    expect(planOutcome(m({ stepPosition: 3, attempts: 2 }), "no_answer", seq.slice(0, 4), FRI)).toMatchObject({ member: { state: "unreachable" } });
  });
  it("an edit mid-run keeps each member's place; a member past the new end is done", () => {
    expect(remapAfterEdit(5, seq.slice(0, 3))).toEqual({ stepPosition: 3, done: true });
    expect(remapAfterEdit(2, seq.slice(0, 3))).toEqual({ stepPosition: 2, done: false });
  });
  it("conditions are part of what Áron approves; a plan with none hashes as before", () => {
    const plain = seq.map((s) => ({ ...s, audienceRule: "all", contentItemId: null }));
    const before = approvalHash({ memberCompanyIds: [1], steps: plain.map(({ audienceRule: _a, ...s }) => s), dailyCap: 15 });
    expect(approvalHash({ memberCompanyIds: [1], steps: plain, dailyCap: 15 })).toBe(before);
    expect(approvalHash({ memberCompanyIds: [1], steps: seq.map((s) => ({ ...s, contentItemId: null })), dailyCap: 15 })).not.toBe(before);
  });
});

describe("e-mail first for prospects; any order for leads by stage; pure cold call stays possible", () => {
  it("checks the order only for a prospect audience", () => {
    const callFirst = [{ channel: "call", position: 1 }, { channel: "email", position: 2 }];
    expect(stepsFitKind("sequence", callFirst)).not.toBeNull();
    expect(stepsFitKind("sequence", callFirst, "leads_by_stage")).toBeNull();
    expect(stepsFitKind("cold_call", [{ channel: "call", position: 1 }])).toBeNull();
  });
});
