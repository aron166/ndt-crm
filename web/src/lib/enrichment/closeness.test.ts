import { describe, it, expect } from "vitest";
import { computeClosenessScore } from "./closeness";

const NOW = new Date("2026-01-01T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

describe("computeClosenessScore", () => {
  it("empty input scores 0", () => {
    expect(computeClosenessScore({ invoices: [], interactions: [], now: NOW })).toBe(0);
  });

  it("revenue thresholds, each step", () => {
    const score = (netAmount: number) =>
      computeClosenessScore({ invoices: [{ netAmount }], interactions: [], now: NOW });
    expect(score(0)).toBe(0);
    expect(score(1)).toBe(10);
    expect(score(1_000_000)).toBe(20);
    expect(score(5_000_000)).toBe(30);
    expect(score(20_000_000)).toBe(40);
    expect(score(50_000_000)).toBe(45);
  });

  it("null and negative netAmount are ignored, not just floored", () => {
    expect(
      computeClosenessScore({
        invoices: [
          { netAmount: null },
          { netAmount: -10_000_000 },
        ],
        interactions: [],
        now: NOW,
      }),
    ).toBe(0);
    // negative offsets a positive total but the SUM is what's floored at 0
    expect(
      computeClosenessScore({
        invoices: [
          { netAmount: 1_000_000 },
          { netAmount: -1_000_000 },
        ],
        interactions: [],
        now: NOW,
      }),
    ).toBe(0);
  });

  it("interaction weight, one of each type", () => {
    const score = (type: string | null) =>
      computeClosenessScore({ invoices: [], interactions: [{ type, occurredAt: NOW }], now: NOW });
    expect(score("meeting")).toBe(8);
    expect(score("site_visit")).toBe(8);
    expect(score("call")).toBe(5);
    expect(score("email")).toBe(3);
    expect(score("carrier_pigeon")).toBe(2);
    expect(score(null)).toBe(2);
  });

  it("recency boundaries: 30 vs 31 days", () => {
    const at = (days: number) =>
      computeClosenessScore({ invoices: [], interactions: [{ type: "call", occurredAt: daysAgo(days) }], now: NOW });
    expect(at(30)).toBe(5); // 5 * 1.0
    expect(at(31)).toBe(Math.round(5 * 0.7)); // 4
  });

  it("recency boundaries: 90 vs 91 days", () => {
    const at = (days: number) =>
      computeClosenessScore({ invoices: [], interactions: [{ type: "call", occurredAt: daysAgo(days) }], now: NOW });
    expect(at(90)).toBe(Math.round(5 * 0.7)); // 4
    expect(at(91)).toBe(Math.round(5 * 0.4)); // 2
  });

  it("recency boundaries: 365 vs 366 days", () => {
    const at = (days: number) =>
      computeClosenessScore({ invoices: [], interactions: [{ type: "call", occurredAt: daysAgo(days) }], now: NOW });
    expect(at(365)).toBe(Math.round(5 * 0.4)); // 2
    expect(at(366)).toBe(Math.round(5 * 0.15)); // 1
  });

  it("a future-dated interaction uses the full 1.0 recency factor", () => {
    const future = new Date(NOW.getTime() + 30 * DAY);
    expect(computeClosenessScore({ invoices: [], interactions: [{ type: "meeting", occurredAt: future }], now: NOW })).toBe(8);
  });

  it("interaction points cap at 55 even with many recent meetings", () => {
    const interactions = Array.from({ length: 20 }, () => ({ type: "meeting", occurredAt: NOW }));
    // 20 * 8 * 1.0 = 160, capped at 55
    expect(computeClosenessScore({ invoices: [], interactions, now: NOW })).toBe(55);
  });

  it("overall score clamps to 100 with max revenue plus many interactions", () => {
    const interactions = Array.from({ length: 20 }, () => ({ type: "meeting", occurredAt: NOW }));
    expect(
      computeClosenessScore({
        invoices: [{ netAmount: 100_000_000 }],
        interactions,
        now: NOW,
      }),
    ).toBe(100);
  });

  it("is deterministic for a fixed now", () => {
    const input = {
      invoices: [{ netAmount: 2_000_000 }],
      interactions: [{ type: "call", occurredAt: daysAgo(10) }],
      now: NOW,
    };
    expect(computeClosenessScore(input)).toBe(computeClosenessScore({ ...input }));
  });
});
