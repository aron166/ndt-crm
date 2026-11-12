import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { parseWindow, lastDays, budapestMidnight, previousBudapestWeek, percentile, summarizeTierA, type TierALeadRow } from "./weekly";

const NOW = new Date("2026-10-07T12:00:00Z");
const DAY = 86_400_000;
const at = (min: number) => new Date(Date.UTC(2026, 9, 1, 8, min));

describe("parseWindow", () => {
  it("defaults to the 7 days ending at now", () => {
    const w = parseWindow(null, null, NOW);
    expect(w).toEqual({ from: new Date(NOW.getTime() - 7 * DAY), to: NOW });
  });
  it("accepts an explicit window", () => {
    expect(parseWindow("2026-09-01", "2026-09-08", NOW)).toEqual({
      from: new Date("2026-09-01"), to: new Date("2026-09-08"),
    });
  });
  it("rejects from >= to", () => {
    expect(parseWindow("2026-09-08", "2026-09-08", NOW)).toHaveProperty("error");
    expect(parseWindow("2026-09-09", "2026-09-08", NOW)).toHaveProperty("error");
  });
  it("rejects more than 92 days, allows exactly 92", () => {
    expect(parseWindow("2026-01-01", "2026-06-01", NOW)).toHaveProperty("error");
    expect(parseWindow("2026-07-01", "2026-10-01", NOW)).toHaveProperty("from");
  });
  it("rejects garbage", () => {
    expect(parseWindow("nope", null, NOW)).toEqual({ error: "Invalid date" });
    expect(parseWindow(null, "nope", NOW)).toEqual({ error: "Invalid date" });
  });
});

describe("lastDays", () => {
  it("is the n days ending at now", () => {
    expect(lastDays(3, NOW)).toEqual({ from: new Date(NOW.getTime() - 3 * DAY), to: NOW });
  });
});

describe("percentile", () => {
  it("empty is null", () => expect(percentile([], 0.5)).toBeNull());
  it("single value", () => expect(percentile([10], 0.5)).toBe(10));
  it("interpolates the median of an even set", () => expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5));
  it("p90 of 1..10 is 9.1", () => {
    const v = percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9);
    expect(v).toBeCloseTo(9.1, 10);
  });
  it("sorts unsorted input", () => expect(percentile([4, 1, 3, 2], 0.5)).toBe(2.5));
});

describe("summarizeTierA", () => {
  const row = (id: number, taskAt: Date | null, firstCallAt: Date | null): TierALeadRow => ({
    leadId: id, companyName: `C${id}`, createdAt: at(0), taskAt, firstCallAt,
  });

  it("counts withoutTask, awaitingCall, contacted", () => {
    const s = summarizeTierA([
      row(1, null, null),
      row(2, null, at(5)),
      row(3, at(0), null),
      row(4, at(0), null),
      row(5, at(0), at(10)),
    ]);
    expect(s.total).toBe(5);
    expect(s.withoutTask).toBe(2);
    expect(s.awaitingCall).toBe(2);
    expect(s.contacted).toBe(1);
  });

  it("clamps a call before the task to 0 minutes", () => {
    const s = summarizeTierA([row(1, at(30), at(10))]);
    expect(s.leads[0].minutesToContact).toBe(0);
    expect(s.medianMinutes).toBe(0);
  });

  it("rounds median and p90 to whole minutes", () => {
    // minutes 1,2: median 1.5 -> 2; p90 1.9 -> 2. minutes 10,11: median 10.5 -> 11
    const s = summarizeTierA([row(1, at(0), at(10)), row(2, at(0), at(11))]);
    expect(s.medianMinutes).toBe(11);
    expect(s.p90Minutes).toBe(11);
    const t = summarizeTierA([row(1, at(0), at(1)), row(2, at(0), at(2))]);
    expect(t.medianMinutes).toBe(2);
  });

  it("ignores uncontacted leads in the median", () => {
    const s = summarizeTierA([row(1, at(0), at(10)), row(2, at(0), null), row(3, at(0), null)]);
    expect(s.medianMinutes).toBe(10);
    expect(s.leads[1].minutesToContact).toBeNull();
  });

  it("no contacted leads gives null stats", () => {
    const s = summarizeTierA([row(1, at(0), null)]);
    expect(s.medianMinutes).toBeNull();
    expect(s.p90Minutes).toBeNull();
  });
});

describe("budapestMidnight", () => {
  it("CEST", () => expect(budapestMidnight(new Date("2026-10-12T05:00:00Z")).toISOString()).toBe("2026-10-11T22:00:00.000Z"));
  it("CET", () => expect(budapestMidnight(new Date("2026-11-02T05:00:00Z")).toISOString()).toBe("2026-11-01T23:00:00.000Z"));
});

describe("previousBudapestWeek", () => {
  it("across the 2026-10-25 DST change", () => {
    const w = previousBudapestWeek(new Date("2026-10-26T05:00:00Z"));
    expect(w.from.toISOString()).toBe("2026-10-18T22:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});

describe("getWeeklyReport revenue", () => {
  // The report issues its raw queries in this order; the revenue rows are the eighth.
  async function run(revenueRows: unknown[]) {
    const { db } = await import("@/lib/db");
    const q = vi.fn();
    (db as unknown as { $queryRaw: unknown }).$queryRaw = q;
    for (let i = 0; i < 7; i++) q.mockResolvedValueOnce(i === 3 ? [{ booked: 0, scheduled: 0, held: 0 }] : []);
    q.mockResolvedValueOnce(revenueRows);
    const { getWeeklyReport, lastDays } = await import("./weekly");
    return getWeeklyReport(1, lastDays(7));
  }
  it("zero deals: empty revenue, not an error", async () => {
    const r = await run([]);
    expect(r.revenue.total).toMatchObject({ won: 0, wonValue: 0, converted: 0 });
    expect(r.revenue.byChannel).toEqual([]);
  });
  const W = { from: new Date("2026-11-02T00:00:00Z"), to: new Date("2026-11-09T00:00:00Z") };
  const raw = (o: Record<string, unknown>) => ({ outcome: "open", value: 100, currency: "HUF", channel: "landing", source: "web", campaign: null, segment: null, convertedAt: null, closedAt: null, ...o });
  it("flags are scoped to the window: converted_at in [from, to), won = closed_at in [from, to)", async () => {
    const { windowRevenueRows } = await import("./weekly");
    const rows = windowRevenueRows([
      raw({ convertedAt: W.from }),                                   // on the lower bound: converted
      raw({ convertedAt: W.to }),                                     // on the upper bound: out
      raw({ convertedAt: new Date("2026-10-30T00:00:00Z"), outcome: "won", closedAt: new Date("2026-11-03T00:00:00Z") }), // converted last week, won now
      raw({ convertedAt: new Date("2026-11-03T00:00:00Z"), outcome: "won", closedAt: W.to }),                              // won exactly at the upper bound: not won this week
      raw({ outcome: "won", closedAt: W.from }),                      // won on the lower bound
      raw({ outcome: "lost", closedAt: new Date("2026-11-03T00:00:00Z") }), // closed but not won: nothing
    ], W);
    expect(rows.map((r) => [r.converted, r.won])).toEqual([[true, false], [false, true], [true, false], [false, true]]);
    expect(rows).toHaveLength(4); // rows that are neither converted nor won in the window are dropped
  });
  it("won deals in the window are joined to channel, campaign and segment", async () => {
    const r = await run([
      { outcome: "won", convertedAt: new Date(Date.now() - 3600_000), closedAt: new Date(Date.now() - 1800_000), value: "500000", currency: "HUF", channel: "cold_email", source: "web", campaign: "bp", segment: "gc" },
    ]);
    expect(r.revenue.total).toMatchObject({ won: 1, wonValue: 500000 });
    expect(r.revenue.byCampaign[0]).toMatchObject({ key: "bp", wonValue: 500000 });
    expect(r.revenue.bySegment[0]).toMatchObject({ key: "A", wonValue: 500000 });
  });
});
