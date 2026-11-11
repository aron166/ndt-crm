import { describe, expect, it } from "vitest";
import { budapestIso, fmtBand, fmtDate, fmtDuration, geometry, gridRows } from "./booking-view";

describe("geometry", () => {
  it("places a block inside the 06:00-19:00 window", () => {
    const g = geometry(12 * 60 + 30, 15 * 60 + 30);
    expect(g.left).toBeCloseTo(50, 5);
    expect(g.width).toBeCloseTo((180 / 780) * 100, 5);
  });
  it("clamps to the window", () => {
    expect(geometry(4 * 60, 8 * 60)).toEqual({ left: 0, width: (120 / 780) * 100 });
    const late = geometry(18 * 60, 22 * 60);
    expect(late.left + late.width).toBeCloseTo(100, 5);
    expect(geometry(20 * 60, 21 * 60)).toEqual({ left: 100, width: 0 });
  });
});

describe("gridRows", () => {
  it("skips weekends", () => {
    // Fri 2026-11-13 .. Tue 2026-11-17
    const rows = gridRows("2026-11-13T05:00:00Z", ["2026-11-17T09:00:00Z"]);
    expect(rows.map((r) => r.key)).toEqual(["2026-11-13", "2026-11-16", "2026-11-17"]);
  });
  it("caps at 10 rows", () => {
    expect(gridRows("2026-11-10T05:00:00Z", ["2026-12-30T09:00:00Z"])).toHaveLength(10);
  });
  it("is one row when there is no later slot", () => {
    expect(gridRows("2026-11-10T05:00:00Z", [])).toHaveLength(1);
  });
});

describe("budapestIso", () => {
  it("is CEST (+2) after the March switch", () => {
    expect(budapestIso("2026-03-30", "09:00")).toBe("2026-03-30T07:00:00.000Z");
  });
  it("is CET (+1) in November", () => {
    expect(budapestIso("2026-11-10", "09:00")).toBe("2026-11-10T08:00:00.000Z");
  });
});

describe("formatting", () => {
  it("formats durations and bands", () => {
    expect(fmtDuration(65)).toBe("1 ó 05 p");
    expect(fmtDuration(45)).toBe("45 p");
    expect(fmtBand({ min: 65, max: 65 })).toBe("1 ó 05 p");
    expect(fmtBand({ min: 65, max: 80 })).toBe("1 ó 05 p - 1 ó 20 p");
  });
  it("formats a Budapest date", () => {
    expect(fmtDate("2026-11-18T12:30:00Z")).toBe("Szerda, nov. 18. 13:30");
  });
});
