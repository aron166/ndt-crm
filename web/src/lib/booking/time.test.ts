import { describe, it, expect } from "vitest";
import { addDays, addWorkingDays, atLocal, localDay, localMinuteOfDay, workingDaysBetween } from "./time";

const day = (y: number, m: number, d: number) => localDay(atLocal({ y, m, d }, 12 * 60));

describe("local time round trip", () => {
  for (const [name, y, m, d] of [["summer", 2026, 7, 15], ["spring switch", 2026, 3, 29], ["autumn switch", 2026, 10, 25]] as const) {
    it(name, () => {
      const dd = day(y, m, d);
      expect(dd.key).toBe(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
      for (const min of [0, 7 * 60, 12 * 60, 18 * 60]) {
        const t = atLocal(dd, min);
        expect(localMinuteOfDay(t)).toBe(min);
        expect(localDay(t).key).toBe(dd.key);
      }
    });
  }
});

describe("addDays", () => {
  it("steps whole calendar days across both DST switches", () => {
    expect(addDays(day(2026, 3, 28), 1).key).toBe("2026-03-29");
    expect(addDays(day(2026, 3, 28), 2).key).toBe("2026-03-30");
    expect(addDays(day(2026, 10, 24), 1).key).toBe("2026-10-25");
    expect(addDays(day(2026, 10, 24), 2).key).toBe("2026-10-26");
    expect(addDays(day(2026, 10, 26), -2).key).toBe("2026-10-24");
  });
});

describe("working days", () => {
  it("workingDaysBetween", () => {
    expect(workingDaysBetween(day(2026, 11, 6), day(2026, 11, 9))).toBe(1); // Fri to Mon
    expect(workingDaysBetween(day(2026, 11, 9), day(2026, 11, 9))).toBe(0);
  });
  it("addWorkingDays from a Saturday", () => {
    const sat = day(2026, 11, 7);
    expect(addWorkingDays(sat, 0).key).toBe("2026-11-09");
    expect(addWorkingDays(sat, 1).key).toBe("2026-11-10");
  });
});
