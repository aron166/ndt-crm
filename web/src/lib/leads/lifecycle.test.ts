import { describe, it, expect } from "vitest";
import {
  ALL_STAGES, DEFAULT_TRANSITIONS, atBudapest, slaDeadline, addWorkdays, cadenceTask, recallDefaultDate, RECALL_REASONS,
  planTransition, findTransition, buildDigest, entryTasks, type LifecycleLead, type DigestLead,
} from "./lifecycle";

const DAY = 86_400_000;
const HOUR = 3_600_000;

describe("slaDeadline (Budapest working hours)", () => {
  it("inside hours: +1 h (winter and summer time)", () => {
    const winter = atBudapest(2026, 11, 9, 10, 0); // Mon
    const summer = atBudapest(2026, 6, 15, 10, 0); // Mon
    expect(slaDeadline(winter).getTime()).toBe(winter.getTime() + HOUR);
    expect(slaDeadline(summer).getTime()).toBe(summer.getTime() + HOUR);
  });
  it("too late to fit the hour: next working morning 09:30", () => {
    expect(slaDeadline(atBudapest(2026, 11, 9, 16, 30))).toEqual(atBudapest(2026, 11, 10, 9, 30));
    expect(slaDeadline(atBudapest(2026, 6, 15, 16, 30))).toEqual(atBudapest(2026, 6, 16, 9, 30));
  });
  it("weekend: Monday 09:30", () => {
    expect(slaDeadline(atBudapest(2026, 11, 14, 12, 0))).toEqual(atBudapest(2026, 11, 16, 9, 30));
  });
  it("before opening: same day 09:30", () => {
    expect(slaDeadline(atBudapest(2026, 11, 9, 7, 0))).toEqual(atBudapest(2026, 11, 9, 9, 30));
  });
  it("atBudapest is DST aware (UTC offset +1 in winter, +2 in summer)", () => {
    expect(atBudapest(2026, 11, 9, 10).toISOString()).toBe("2026-11-09T09:00:00.000Z");
    expect(atBudapest(2026, 6, 15, 10).toISOString()).toBe("2026-06-15T08:00:00.000Z");
  });
});

describe("addWorkdays", () => {
  it("skips the weekend", () => {
    expect(addWorkdays(atBudapest(2026, 11, 13, 10), 1)).toEqual(atBudapest(2026, 11, 16, 10)); // Fri -> Mon
    expect(addWorkdays(atBudapest(2026, 11, 12, 10), 3)).toEqual(atBudapest(2026, 11, 17, 10)); // Thu -> Tue
  });
});

describe("cadenceTask", () => {
  it("is due at day 0 + offset", () => {
    const day0 = new Date("2026-11-01T10:00:00Z");
    expect(cadenceTask(5, day0, day0)?.dueDate.getTime()).toBe(day0.getTime() + 7 * DAY);
  });
  it("never returns a due date in the past", () => {
    const day0 = new Date("2026-10-01T10:00:00Z");
    const now = new Date("2026-11-01T10:00:00Z");
    for (let n = 1; n <= 8; n++) expect(cadenceTask(n, day0, now)!.dueDate.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });
  it("attempt 8 is the closing email; out of range is null", () => {
    const d = new Date();
    expect(cadenceTask(8, d, d)?.type).toBe("email");
    expect(cadenceTask(9, d, d)).toBeNull();
  });
});

describe("recallDefaultDate", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  it("per reason", () => {
    expect(recallDefaultDate("timing", now).getTime()).toBe(now.getTime() + 90 * DAY);
    expect(recallDefaultDate("no_decision", now).getTime()).toBe(now.getTime() + 60 * DAY);
    expect(recallDefaultDate("unreachable", now).getTime()).toBe(now.getTime() + 60 * DAY);
    expect(recallDefaultDate("no_show", now).getTime()).toBe(now.getTime() + 30 * DAY);
    expect(recallDefaultDate("budget_cycle", now)).toEqual(atBudapest(2027, 1, 6, 9, 0));
  });
  it("covers every reason", () => {
    for (const r of RECALL_REASONS) expect(recallDefaultDate(r, now).getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("planTransition", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  const lead = (status: string, extra: Partial<LifecycleLead> = {}): LifecycleLead => ({
    status, attempts: 0, assignedToId: 1, offerType: null, nextAction: null, nextDue: null, statusEnteredAt: now, ...extra,
  });
  const row = (from: string, event: string) => findTransition(DEFAULT_TRANSITIONS, from, event)!;
  const err = (r: ReturnType<typeof planTransition>) => ("error" in r ? r.error : null);

  it("an open lead needs owner, next action and due, and the error names the missing one", () => {
    const t = row("contacting", "call_meeting_booked");
    expect(err(planTransition(lead("contacting", { assignedToId: null }), t, { nextAction: "x", nextDue: now }, now))).toContain("felelős");
    expect(err(planTransition(lead("contacting"), t, { nextDue: now }, now))).toContain("következő lépés");
    expect(err(planTransition(lead("contacting"), t, { nextAction: "x" }, now))).toContain("határidő");
    const ok = planTransition(lead("contacting"), t, { nextAction: "x", nextDue: now }, now);
    expect(err(ok)).toBeNull();
  });
  it("closed stages clear next action and due", () => {
    const r = planTransition(lead("contacting"), row("contacting", "call_no_fit"), { lostReason: "no_need", nextAction: "x", nextDue: now }, now);
    if ("error" in r) throw new Error(r.error);
    expect(r.data).toMatchObject({ outcome: "lost", nextAction: null, nextDue: null });
  });
  it("entering demo_done sets the credit clock (now + 30 d) and plans 5 tasks", () => {
    const r = planTransition(lead("demo_booked"), row("demo_booked", "demo_delivered"), {}, now);
    if ("error" in r) throw new Error(r.error);
    expect(r.data.demoCreditUntil?.getTime()).toBe(now.getTime() + 30 * DAY);
    expect(r.data.demoDoneAt).toEqual(now);
    expect(r.tasks).toHaveLength(5);
  });
  it("entering qualified without offerType errors; with the lead's own offerType passes", () => {
    const t = row("contacting", "call_qualified");
    expect(err(planTransition(lead("contacting"), t, {}, now))).toContain("ajánlat típusa");
    expect(err(planTransition(lead("contacting", { offerType: "rental" }), t, {}, now))).toBeNull();
  });
  it("leaving lost sets outcome open", () => {
    const r = planTransition(lead("lost"), row("lost", "inbound_received"), {}, now);
    if ("error" in r) throw new Error(r.error);
    expect(r.data).toMatchObject({ status: "new", outcome: "open", closedAt: null });
  });
  it("ordered -> won (order_won) closes the lead as won and plans the handover task", () => {
    const r = planTransition(lead("ordered", { nextAction: "x", nextDue: now }), row("ordered", "order_won"), {}, now);
    if ("error" in r) throw new Error(r.error);
    expect(r.data).toMatchObject({ status: "won", outcome: "won", closedAt: now, nextAction: null, nextDue: null });
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks[0].title).toContain("Átadás");
  });
  it("a from mismatch errors", () => {
    expect(err(planTransition(lead("new"), row("contacting", "call_no_answer"), {}, now))).toContain("Nem engedélyezett");
  });
  it("lost needs a code, and other needs a note", () => {
    const t = row("contacting", "call_no_fit");
    expect(err(planTransition(lead("contacting"), t, {}, now))).not.toBeNull();
    expect(err(planTransition(lead("contacting"), t, { lostReason: "other" }, now))).not.toBeNull();
    expect(err(planTransition(lead("contacting"), t, { lostReason: "other", lostNote: "mert" }, now))).toBeNull();
  });
  it("recall defaults the reason from the event and the date from the reason", () => {
    const r = planTransition(lead("contacting"), row("contacting", "attempts_exhausted"), {}, now);
    if ("error" in r) throw new Error(r.error);
    expect(r.data.recallReason).toBe("unreachable");
    expect(r.data.recallDate?.getTime()).toBe(now.getTime() + 60 * DAY);
  });
  it("entering contacting resets attempts; a self transition plans no entry tasks", () => {
    const r = planTransition(lead("recall"), row("recall", "recall_date_reached"), {}, now);
    if ("error" in r) throw new Error(r.error);
    expect(r.data.attempts).toBe(0);
    expect(entryTasks("contacting", "call_no_answer", now)).toEqual([]);
  });
});

describe("buildDigest", () => {
  const now = new Date("2026-11-09T10:00:00Z"); // Mon 11:00 Budapest
  const L = (id: number, extra: Partial<DigestLead>): DigestLead => ({
    id, name: `L${id}`, status: "offer_sent", ownerName: "Péter", attempts: 0, nextAction: "hív",
    nextDue: new Date(now.getTime() + 30 * DAY), statusEnteredAt: now, recallDate: null, ...extra,
  });
  it("buckets leads and ignores won / lost", () => {
    const d = buildDigest([
      L(1, { nextDue: new Date(now.getTime() + 2 * HOUR) }),
      L(2, { nextDue: new Date(now.getTime() - HOUR) }),
      L(3, { statusEnteredAt: new Date(now.getTime() - 11 * DAY) }),
      L(4, { nextAction: null }),
      L(5, { status: "won", nextAction: null, nextDue: new Date(now.getTime() - DAY) }),
      L(6, { status: "lost", nextAction: null, nextDue: null }),
    ], now);
    expect(d.dueToday.map((l) => l.id)).toEqual([1]);
    expect(d.overdue.map((l) => l.id)).toEqual([2]);
    expect(d.pastMaxAge.map((l) => l.id)).toContain(3);
    expect(d.noNextAction.map((l) => l.id)).toEqual([4]);
    expect(d.text).toContain("Ma esedékes (1)");
  });
  it("nothing to do gives the empty text", () => {
    expect(buildDigest([L(1, {})], now).text).toBe("Nincs teendő.");
  });
});

describe("DEFAULT_TRANSITIONS", () => {
  it("every from / to is a known stage", () => {
    for (const t of DEFAULT_TRANSITIONS) {
      expect(ALL_STAGES).toContain(t.from);
      expect(ALL_STAGES).toContain(t.to);
    }
  });
  it("(from, event) pairs are unique", () => {
    const keys = DEFAULT_TRANSITIONS.map((t) => `${t.from}|${t.event}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("call_logged: reached, second call agreed", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  const base = { status: "new", attempts: 0, assignedToId: 3, offerType: null, nextAction: null, nextDue: null, statusEnteredAt: now };
  const next = { nextAction: "Második hívás", nextDue: new Date("2026-11-10T09:00:00Z") };
  it("new -> contacting with attempts 1, contacting stays with attempts + 1", () => {
    const t1 = findTransition(DEFAULT_TRANSITIONS, "new", "call_logged")!;
    const r1 = planTransition(base, t1, next, now);
    expect("error" in r1 ? r1 : r1.data).toMatchObject({ status: "contacting", attempts: 1, nextAction: "Második hívás" });
    const t2 = findTransition(DEFAULT_TRANSITIONS, "contacting", "call_logged")!;
    const r2 = planTransition({ ...base, status: "contacting", attempts: 3 }, t2, next, now);
    expect("error" in r2 ? r2 : r2.data).toMatchObject({ status: "contacting", attempts: 4 });
  });
  it("still needs a next action (no entry task)", () => {
    const t1 = findTransition(DEFAULT_TRANSITIONS, "new", "call_logged")!;
    expect(planTransition(base, t1, {}, now)).toHaveProperty("error");
  });
});
