import { describe, it, expect } from "vitest";
import { aggregate, isBooked, revenueBreakdown, type RevenueRow } from "./analytics";

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

describe("revenueBreakdown", () => {
  const row = (o: Partial<RevenueRow>): RevenueRow => ({ converted: false, won: false, value: null, currency: null, channel: null, source: null, campaign: null, segment: null, ...o });

  it("zero rows (production has zero deals): all zeros, no breakdown rows", () => {
    expect(revenueBreakdown([])).toEqual({ total: { leads: 0, converted: 0, convertedValue: 0, won: 0, wonValue: 0, otherCurrency: 0 }, bySegment: [], byChannel: [], bySource: [], byCampaign: [] });
  });
  it("leads that never converted add nothing but their count", () => {
    const r = revenueBreakdown([row({ channel: "landing" }), row({ channel: "landing" })]);
    expect(r.total).toMatchObject({ leads: 2, converted: 0, won: 0, wonValue: 0 });
    expect(r.byChannel).toEqual([{ key: "landing", leads: 2, converted: 0, convertedValue: 0, won: 0, wonValue: 0, otherCurrency: 0 }]);
  });
  it("sums converted value and won value per channel, source, campaign and mailed segment", () => {
    const r = revenueBreakdown([
      row({ converted: true, won: true, value: 400000, currency: "HUF", channel: "cold_email", source: "web", campaign: "bp", segment: "gc" }),
      row({ converted: true, won: false, value: 250000, currency: "HUF", channel: "cold_email", source: "web", campaign: "bp", segment: "contractor" }),
      row({ converted: true, won: true, value: 100000, currency: "HUF", channel: "landing", source: "web", campaign: null, segment: "drillers" }),
      row({ channel: "landing", segment: "nonsense" }),
    ]);
    expect(r.total).toMatchObject({ leads: 4, converted: 3, convertedValue: 750000, won: 2, wonValue: 500000 });
    expect(r.byChannel.find((x) => x.key === "cold_email")).toMatchObject({ converted: 2, convertedValue: 650000, won: 1, wonValue: 400000 });
    expect(r.bySource.map((x) => x.key)).toEqual(["web", null]);
    expect(r.byCampaign.map((x) => x.key)).toEqual(["bp", null]);
    // raw launch-list segments map to the mailed keys A..G; an unmappable one stays unknown (null)
    expect(r.bySegment.find((x) => x.key === "A")).toMatchObject({ converted: 2, wonValue: 400000 });
    expect(r.bySegment.find((x) => x.key === "D")).toMatchObject({ wonValue: 100000 });
    expect(r.bySegment.find((x) => x.key === null)).toMatchObject({ leads: 1, converted: 0 });
  });
  it("a won lead with no deal value counts as won, adds 0; a foreign currency is counted aside, never summed into HUF", () => {
    const r = revenueBreakdown([
      row({ converted: true, won: true, value: null, currency: "HUF" }),
      row({ converted: true, won: true, value: 900, currency: "EUR" }),
    ]);
    expect(r.total).toMatchObject({ won: 2, wonValue: 0, convertedValue: 0, otherCurrency: 1 });
  });
});

describe("delivery events are not touches", () => {
  it("email_delivered and email_opened do not count", () => {
    const at = new Date("2026-11-16T08:00:00Z");
    const r = aggregate(
      [{ id: 1, state: "queued", leadId: null }],
      [{ memberId: 1, stepPosition: 1, outcome: "email_delivered", at }, { memberId: 1, stepPosition: 1, outcome: "email_opened", at }],
      [],
    );
    expect(r.touched).toBe(0);
    expect(r.byDay).toHaveLength(0);
  });
});
