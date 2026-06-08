import { describe, it, expect } from "vitest";
import {
  streamRevenue, totalRevenue, gapToTarget, quantityToHitTarget, revenueShares,
  type RevenueStream,
} from "./calc";

const mk = (over: Partial<RevenueStream> & { key: string }): RevenueStream => ({
  label: over.key, unitValue: 0, quantity: 0, ...over,
});

describe("equalizer calc", () => {
  it("streamRevenue multiplies, flooring negatives at 0", () => {
    expect(streamRevenue({ unitValue: 1000, quantity: 3 })).toBe(3000);
    expect(streamRevenue({ unitValue: -5, quantity: 3 })).toBe(0);
    expect(streamRevenue({ unitValue: 1000, quantity: -2 })).toBe(0);
  });

  it("totalRevenue sums all streams", () => {
    const streams = [mk({ key: "a", unitValue: 100, quantity: 2 }), mk({ key: "b", unitValue: 50, quantity: 4 })];
    expect(totalRevenue(streams)).toBe(400);
  });

  it("gapToTarget is target minus total (positive = short)", () => {
    const streams = [mk({ key: "a", unitValue: 100, quantity: 2 })];
    expect(gapToTarget(streams, 500)).toBe(300);
    expect(gapToTarget(streams, 100)).toBe(-100);
  });

  it("quantityToHitTarget solves one stream holding others fixed (ceil)", () => {
    const streams = [
      mk({ key: "a", unitValue: 100, quantity: 2 }), // 200 fixed
      mk({ key: "b", unitValue: 300, quantity: 0 }),
    ];
    // need 1000 total, others=200, b unit=300 → (1000-200)/300 = 2.67 → ceil 3
    expect(quantityToHitTarget(streams, "b", 1000)).toBe(3);
  });

  it("quantityToHitTarget returns 0 when others already exceed target", () => {
    const streams = [mk({ key: "a", unitValue: 100, quantity: 20 }), mk({ key: "b", unitValue: 300, quantity: 0 })];
    expect(quantityToHitTarget(streams, "b", 1000)).toBe(0);
  });

  it("quantityToHitTarget returns null when the stream has no unit value", () => {
    const streams = [mk({ key: "b", unitValue: 0, quantity: 0 })];
    expect(quantityToHitTarget(streams, "b", 1000)).toBeNull();
    expect(quantityToHitTarget(streams, "missing", 1000)).toBeNull();
  });

  it("revenueShares are fractions of total (0 when total is 0)", () => {
    const streams = [mk({ key: "a", unitValue: 100, quantity: 3 }), mk({ key: "b", unitValue: 100, quantity: 1 })];
    const shares = revenueShares(streams);
    expect(shares.find((s) => s.key === "a")!.share).toBeCloseTo(0.75);
    expect(shares.find((s) => s.key === "b")!.share).toBeCloseTo(0.25);
    expect(revenueShares([mk({ key: "a" })])[0].share).toBe(0);
  });
});
