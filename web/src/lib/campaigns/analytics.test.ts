import { describe, it, expect } from "vitest";
import { aggregate, isBooked } from "./analytics";

describe("campaign analytics aggregate", () => {
  const members = [
    { id: 1, state: "promoted", leadId: 100 },
    { id: 2, state: "promoted", leadId: 101 },
    { id: 3, state: "queued", leadId: null },
    { id: 4, state: "needs_contact", leadId: null },
    { id: 5, state: "declined", leadId: null },
    { id: 6, state: "unreachable", leadId: null },
  ];
  const events = [
    { memberId: 1, stepPosition: 1, outcome: "email_sent", at: new Date("2026-11-16T08:00:00Z") },
    { memberId: 1, stepPosition: 1, outcome: "reply_positive", at: new Date("2026-11-17T08:00:00Z") },
    { memberId: 2, stepPosition: 2, outcome: "no_answer", at: new Date("2026-11-19T08:00:00Z") },
    { memberId: 2, stepPosition: 2, outcome: "wants", at: new Date("2026-11-21T08:00:00Z") },
    { memberId: 3, stepPosition: 2, outcome: "note_only", at: new Date("2026-11-21T09:00:00Z") },
    { memberId: 5, stepPosition: 1, outcome: "unsubscribe", at: new Date("2026-11-16T22:30:00Z") }, // 23:30 Budapest, still the 16th
    { memberId: 6, stepPosition: 2, outcome: "no_answer", at: new Date("2026-11-19T09:00:00Z") },
  ];
  const leads = [
    { id: 100, status: "new", outcome: "open" },
    { id: 101, status: "demo_booked", outcome: "open" },
  ];
  const s = aggregate(members, events, leads);

  it("headline counts", () => {
    expect(s).toMatchObject({ audience: 6, needsContact: 1, touched: 4, replied: 2, promoted: 2, booked: 1, declined: 1, unreachable: 1 });
  });
  it("a note is not a touch", () => {
    expect(s.byStep.find((x) => x.step === 2)?.touched).toBe(2);
  });
  it("by step", () => {
    expect(s.byStep).toEqual([
      { step: 1, touched: 2, replied: 2, promoted: 1 },
      { step: 2, touched: 2, replied: 0, promoted: 1 },
    ]);
  });
  it("by Budapest day", () => {
    expect(s.byDay.map((d) => d.day)).toEqual(["2026-11-16", "2026-11-17", "2026-11-19", "2026-11-21"]);
    expect(s.byDay[0]).toEqual({ day: "2026-11-16", touches: 2, replies: 1, promoted: 0 });
  });
  it("booked = a booked meeting stage or won, not qualified alone", () => {
    expect(isBooked({ id: 1, status: "qualified", outcome: "open" })).toBe(false);
    expect(isBooked({ id: 1, status: "discovery_booked", outcome: "open" })).toBe(true);
    expect(isBooked({ id: 1, status: "won", outcome: "won" })).toBe(true);
    expect(isBooked({ id: 1, status: "recall", outcome: "open" })).toBe(false);
  });
});
