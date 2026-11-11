import { describe, it, expect } from "vitest";
import { localDay } from "@/lib/booking/time";
import {
  approvalHash, canApprove, canSetStatus, isForwardMove, planOutcome, selectDailyList, startFor, stepsFitKind, inWindow,
  MAX_NO_ANSWER, type StepDef,
} from "./rules";
import { MAIN_STAGES } from "@/lib/leads/lifecycle";

const EMAIL_THEN_CALL: StepDef[] = [
  { position: 1, channel: "email", waitDays: 0 },
  { position: 2, channel: "call", waitDays: 3 },
];
const CALL_ONLY: StepDef[] = [{ position: 1, channel: "call", waitDays: 0 }];
// Wednesday 2026-11-11, Budapest
const WED = localDay(new Date("2026-11-11T09:00:00Z"));
const open = (over: Partial<{ state: "queued"; stepPosition: number; attempts: number; hasPhone: boolean }> = {}) =>
  ({ state: "queued" as const, stepPosition: 2, attempts: 0, hasPhone: true, ...over });

describe("startFor: e-mail first for everyone (Áron 2026-11-11)", () => {
  it("a member with an e-mail starts on the e-mail step", () => {
    expect(startFor(EMAIL_THEN_CALL, { hasEmail: true, hasPhone: true })).toEqual({ stepPosition: 1, state: "queued" });
  });
  it("a warm member (Péter's past client) gets the e-mail first too: no phone-only exception", () => {
    // The old phone_only flag is gone; nothing in the input can route a member past the e-mail.
    expect(startFor(EMAIL_THEN_CALL, { hasEmail: true, hasPhone: true }).stepPosition).toBe(1);
  });
  it("no e-mail is needs_email on the e-mail step, never skipped to the call", () => {
    expect(startFor(EMAIL_THEN_CALL, { hasEmail: false, hasPhone: true })).toEqual({ stepPosition: 1, state: "needs_email" });
  });
  it("no phone and no e-mail on a sequence is needs_email (the e-mail comes first)", () => {
    expect(startFor(EMAIL_THEN_CALL, { hasEmail: false, hasPhone: false }).state).toBe("needs_email");
  });
  it("a pure cold-call campaign starts on the call; no phone is needs_contact", () => {
    expect(startFor(CALL_ONLY, { hasEmail: false, hasPhone: true })).toEqual({ stepPosition: 1, state: "queued" });
    expect(startFor(CALL_ONLY, { hasEmail: true, hasPhone: false }).state).toBe("needs_contact");
  });
});

describe("inWindow: the campaign's dates gate the daily list", () => {
  it("before the start and after the end nobody is listed; open ends are no limit", () => {
    expect(inWindow("2026-11-26", null, "2026-11-25")).toBe(false);
    expect(inWindow("2026-11-26", null, "2026-11-26")).toBe(true);
    expect(inWindow(null, "2026-11-27", "2026-11-28")).toBe(false);
    expect(inWindow(null, null, "2026-11-11")).toBe(true);
  });
});

describe("stepsFitKind", () => {
  const call = (position: number) => ({ position, channel: "call" as const });
  const email = (position: number) => ({ position, channel: "email" as const });
  it("a sequence opens with the e-mail; a call before it is refused", () => {
    expect(stepsFitKind("sequence", [email(1), call(2)])).toBeNull();
    expect(stepsFitKind("sequence", [call(1), email(2)])).toMatch(/e-mail/);
    expect(stepsFitKind("sequence", [{ position: 1, channel: "post" as const }, call(2), email(3)])).toMatch(/e-mail/);
  });
  it("cold_call takes calls only, cold_email e-mails only", () => {
    expect(stepsFitKind("cold_call", [call(1), call(2)])).toBeNull();
    expect(stepsFitKind("cold_call", [email(1), call(2)])).not.toBeNull();
    expect(stepsFitKind("cold_email", [email(1)])).toBeNull();
    expect(stepsFitKind("cold_email", [email(1), call(2)])).not.toBeNull();
  });
  it("ad, organic and content are content only", () => {
    expect(stepsFitKind("ad", [{ position: 1, channel: "ad" as const }])).toBeNull();
    expect(stepsFitKind("organic", [email(1)])).not.toBeNull();
    expect(stepsFitKind(null, [call(1)])).not.toBeNull();
  });
});

describe("planOutcome: the promotion rule", () => {
  it("Érdeklődik promotes to a lead in contacting, without an SLA task", () => {
    const p = planOutcome(open(), "interested", EMAIL_THEN_CALL, WED);
    expect("error" in p).toBe(false);
    if ("error" in p) return;
    expect(p.member.state).toBe("promoted");
    expect(p.promote).toMatchObject({ stage: "contacting", sla: false });
    expect(p.logCall).toBe(true);
  });
  it("Kéri / akarja promotes to qualified, without an SLA task", () => {
    const p = planOutcome(open(), "wants", EMAIL_THEN_CALL, WED);
    if ("error" in p) throw new Error(p.error);
    expect(p.promote).toMatchObject({ stage: "qualified", sla: false });
  });
  it("a positive e-mail reply promotes to new WITH the SLA call (one task per real reply)", () => {
    const p = planOutcome(open({ stepPosition: 1 }), "reply_positive", EMAIL_THEN_CALL, WED);
    if ("error" in p) throw new Error(p.error);
    expect(p.promote).toMatchObject({ stage: "new", sla: true });
    expect(p.logCall).toBe(false);
  });
  it("no answer stays a prospect, back after 2 working days", () => {
    const p = planOutcome(open(), "no_answer", EMAIL_THEN_CALL, WED);
    if ("error" in p) throw new Error(p.error);
    expect(p.promote).toBeNull();
    expect(p.member).toMatchObject({ state: "queued", attempts: 1, nextEligibleOn: "2026-11-13" });
  });
  it("no answer over the weekend skips to Monday", () => {
    const fri = localDay(new Date("2026-11-13T09:00:00Z"));
    const p = planOutcome(open(), "no_answer", EMAIL_THEN_CALL, fri);
    if ("error" in p) throw new Error(p.error);
    expect(p.member.nextEligibleOn).toBe("2026-11-17");
  });
  it(`the ${MAX_NO_ANSWER}rd no answer makes the member unreachable, still no lead`, () => {
    const p = planOutcome(open({ attempts: MAX_NO_ANSWER - 1 }), "no_answer", EMAIL_THEN_CALL, WED);
    if ("error" in p) throw new Error(p.error);
    expect(p.member.state).toBe("unreachable");
    expect(p.promote).toBeNull();
  });
  it("not interested declines, bad number excludes, neither creates a lead", () => {
    for (const [o, s] of [["not_interested", "declined"], ["bad_number", "excluded"]] as const) {
      const p = planOutcome(open(), o, EMAIL_THEN_CALL, WED);
      if ("error" in p) throw new Error(p.error);
      expect(p.member.state).toBe(s);
      expect(p.promote).toBeNull();
    }
  });
  it("e-mail sent moves the member to the call step, eligible after its wait (no reply -> call)", () => {
    const p = planOutcome(open({ stepPosition: 1 }), "email_sent", EMAIL_THEN_CALL, WED);
    if ("error" in p) throw new Error(p.error);
    expect(p.member).toMatchObject({ state: "queued", stepPosition: 2, nextEligibleOn: "2026-11-16" });
  });
  it("e-mail sent with no call step left (or no phone) finishes the member", () => {
    const p = planOutcome(open({ stepPosition: 1, hasPhone: false }), "email_sent", EMAIL_THEN_CALL, WED);
    if ("error" in p) throw new Error(p.error);
    expect(p.member.state).toBe("done");
  });
  it("unsubscribe declines and suppresses", () => {
    const p = planOutcome(open({ stepPosition: 1 }), "unsubscribe", EMAIL_THEN_CALL, WED);
    if ("error" in p) throw new Error(p.error);
    expect(p).toMatchObject({ suppress: true, promote: null });
    expect(p.member.state).toBe("declined");
  });
  it("a bounce is needs_email, never a fall-through to the call", () => {
    const p = planOutcome(open({ stepPosition: 1 }), "bounce", EMAIL_THEN_CALL, WED);
    if ("error" in p) throw new Error(p.error);
    expect(p.member).toMatchObject({ stepPosition: 1, state: "needs_email" });
  });
  it("a bounce suppresses the dead address so a reload cannot requeue it", () => {
    const p = planOutcome(open({ stepPosition: 1 }), "bounce", EMAIL_THEN_CALL, WED);
    if ("error" in p) throw new Error(p.error);
    expect(p.suppress).toBe(true);
  });
  it("a call outcome is refused before the e-mail went out or on a needs_email member", () => {
    expect(planOutcome(open({ stepPosition: 1 }), "interested", EMAIL_THEN_CALL, WED)).toHaveProperty("error");
    expect(planOutcome({ ...open(), state: "needs_email" as never }, "no_answer", EMAIL_THEN_CALL, WED)).toHaveProperty("error");
    expect(planOutcome({ ...open({ stepPosition: 1 }), state: "needs_email" as never }, "note_only", EMAIL_THEN_CALL, WED)).not.toHaveProperty("error");
  });
  it("a closed member takes no outcome but a note", () => {
    const closed = { ...open(), state: "promoted" as never };
    expect(planOutcome(closed, "interested", CALL_ONLY, WED)).toHaveProperty("error");
    expect(planOutcome(closed, "note_only", CALL_ONLY, WED)).not.toHaveProperty("error");
  });
});

describe("selectDailyList: the cap is computed on read", () => {
  const now = new Date("2026-11-11T08:00:00Z");
  const mk = (id: number, over: Partial<{ state: string; stepPosition: number; nextEligibleOn: string | null; priority: number; city: string | null; lastTouchedAt: Date | null }> = {}) =>
    ({ id, state: "queued", stepPosition: 1, nextEligibleOn: null, priority: 100, city: null, lastTouchedAt: null, ...over });
  const CALL = new Set([1]);

  it("481 queued members give 15 today, not 481 tasks", () => {
    const many = Array.from({ length: 481 }, (_, i) => mk(i + 1));
    const r = selectDailyList(many, CALL, 15, now);
    expect(r.ids).toHaveLength(15);
    expect(r.remaining).toBe(466);
  });
  it("members already touched today count against the cap", () => {
    const list = [mk(1, { lastTouchedAt: new Date("2026-11-11T07:00:00Z"), state: "promoted" }), mk(2), mk(3), mk(4)];
    const r = selectDailyList(list, CALL, 2, now);
    expect(r.touchedToday).toBe(1);
    expect(r.ids).toEqual([2]);
  });
  it("yesterday's touch (Budapest day) does not count", () => {
    const list = [mk(1, { lastTouchedAt: new Date("2026-11-10T22:30:00Z") }), mk(2)]; // 23:30 Budapest on the 10th
    expect(selectDailyList(list, CALL, 5, now).touchedToday).toBe(0);
  });
  it("only queued members on a call step whose day has come; priority then city", () => {
    const list = [
      mk(1, { nextEligibleOn: "2026-11-12" }),
      mk(2, { stepPosition: 2 }),
      mk(3, { state: "needs_contact" }),
      mk(4, { priority: 50, city: "Szeged" }),
      mk(5, { priority: 50, city: "Budapest" }),
      mk(6, { nextEligibleOn: "2026-11-11" }),
    ];
    expect(selectDailyList(list, CALL, 10, now).ids).toEqual([5, 4, 6]);
  });
  it("a cap change changes today's list immediately", () => {
    const many = Array.from({ length: 30 }, (_, i) => mk(i + 1));
    expect(selectDailyList(many, CALL, 25, now).ids).toHaveLength(25);
  });
});

describe("approval and status", () => {
  const steps = [{ position: 1, channel: "call" as const, waitDays: 0, contentItemId: 7 }];
  it("the hash covers members, steps and cap, and ignores member order", () => {
    const a = approvalHash({ memberCompanyIds: [3, 1, 2], steps, dailyCap: 15 });
    expect(a).toBe(approvalHash({ memberCompanyIds: [1, 2, 3], steps, dailyCap: 15 }));
    expect(a).not.toBe(approvalHash({ memberCompanyIds: [1, 2, 3], steps, dailyCap: 16 }));
    expect(a).not.toBe(approvalHash({ memberCompanyIds: [1, 2], steps, dailyCap: 15 }));
    expect(a).not.toBe(approvalHash({ memberCompanyIds: [1, 2, 3], steps: [{ ...steps[0], contentItemId: 8 }], dailyCap: 15 }));
  });
  it("running is reached only from draft or paused; pause only from running", () => {
    expect(canApprove("draft")).toBe(true);
    expect(canApprove("paused")).toBe(true);
    expect(canApprove("stopped")).toBe(false);
    expect(canSetStatus("draft", "paused")).toBe(false);
    expect(canSetStatus("running", "paused")).toBe(true);
    expect(canSetStatus("stopped", "stopped")).toBe(false);
  });
  it("an existing lead moves forward only, never out of a side stage", () => {
    expect(isForwardMove(MAIN_STAGES, "new", "contacting")).toBe(true);
    expect(isForwardMove(MAIN_STAGES, "qualified", "contacting")).toBe(false);
    expect(isForwardMove(MAIN_STAGES, "recall", "qualified")).toBe(false);
    expect(isForwardMove(MAIN_STAGES, "new", "new")).toBe(false);
  });
});

describe("call script per step (item 6)", () => {
  it("each call step shows its own script; a call step without one shows none, never another step's", async () => {
    const { scriptItemFor } = await import("./rules");
    const steps = [
      { position: 1, channel: "email", contentItemId: 10 },
      { position: 2, channel: "call", contentItemId: 20 },
      { position: 3, channel: "email", contentItemId: 30 },
      { position: 4, channel: "call", contentItemId: 40 },
      { position: 5, channel: "call", contentItemId: null },
    ];
    expect(scriptItemFor(steps, 2)).toBe(20);
    expect(scriptItemFor(steps, 4)).toBe(40);
    expect(scriptItemFor(steps, 5)).toBeNull();
    expect(scriptItemFor(steps, 1)).toBeNull();
  });
});
