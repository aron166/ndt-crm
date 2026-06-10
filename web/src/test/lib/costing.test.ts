import { describe, it, expect } from "vitest";
import {
  computeCostAmount,
  rollupTaskCost,
  costCodeLabel,
  costCodeUnitHint,
} from "@/lib/tasks/costing";

describe("computeCostAmount", () => {
  it("multiplies quantity by unit rate, rounded to whole HUF", () => {
    expect(computeCostAmount(80, 300)).toBe(24000);
    expect(computeCostAmount(3.5, 8000)).toBe(28000);
    expect(computeCostAmount(2.337, 1000)).toBe(2337);
  });

  it("returns null when either input is missing", () => {
    expect(computeCostAmount(null, 300)).toBeNull();
    expect(computeCostAmount(80, null)).toBeNull();
    expect(computeCostAmount(undefined, undefined)).toBeNull();
  });

  it("returns null for non-finite input", () => {
    expect(computeCostAmount(NaN, 300)).toBeNull();
    expect(computeCostAmount(80, Infinity)).toBeNull();
  });

  it("treats a zero rate or quantity as a real 0 amount", () => {
    expect(computeCostAmount(0, 300)).toBe(0);
    expect(computeCostAmount(80, 0)).toBe(0);
  });
});

describe("rollupTaskCost", () => {
  it("sums the task plus subtasks grouped by cost code", () => {
    const result = rollupTaskCost(
      { costCode: "KID", costAmount: 24000 },
      [
        { costCode: "SZD", costAmount: 24000 },
        { costCode: "VIZSGALAT", costAmount: 18000 },
        { costCode: "SZD", costAmount: 8000 }, // same code accumulates
      ],
    );
    expect(result.total).toBe(74000);
    expect(result.byCode).toEqual([
      { code: "KID", amount: 24000 },
      { code: "SZD", amount: 32000 },
      { code: "VIZSGALAT", amount: 18000 },
    ]);
  });

  it("ignores lines with no code or no amount", () => {
    const result = rollupTaskCost(
      { costCode: null, costAmount: 5000 },
      [
        { costCode: "KID", costAmount: null },
        { costCode: "KID", costAmount: 3000 },
      ],
    );
    expect(result.total).toBe(3000);
    expect(result.byCode).toEqual([{ code: "KID", amount: 3000 }]);
  });

  it("returns an empty rollup when nothing is billable", () => {
    const result = rollupTaskCost({ costCode: null, costAmount: null }, []);
    expect(result.total).toBe(0);
    expect(result.byCode).toEqual([]);
  });

  it("preserves canonical cost-code order regardless of input order", () => {
    const result = rollupTaskCost({ costCode: "VIZSGALAT", costAmount: 1 }, [
      { costCode: "KID", costAmount: 1 },
      { costCode: "DOD", costAmount: 1 },
    ]);
    expect(result.byCode.map((l) => l.code)).toEqual(["KID", "DOD", "VIZSGALAT"]);
  });
});

describe("costCodeLabel / costCodeUnitHint", () => {
  it("returns the label and unit hint for a known code", () => {
    expect(costCodeLabel("KID")).toContain("Kiszállási");
    expect(costCodeUnitHint("SZD")).toBe("óra");
  });

  it("falls back to the raw code and empty hint for unknown / null", () => {
    expect(costCodeLabel("XYZ")).toBe("XYZ");
    expect(costCodeLabel(null)).toBe("");
    expect(costCodeUnitHint(null)).toBe("");
  });
});
