import { describe, it, expect } from "vitest";
import { DEFAULT_BOOKING_CONFIG as cfg } from "./config";
import { checkPlacement } from "./feasibility";
import { bestOnDay, proposeRouteSlots, type RouteSlotsInput } from "./route-slots";
import type { Machine, RouteStop } from "./route-types";
import { atLocal, localDay } from "./time";
import { straightLineSource as drive, type Place } from "./travel";

const ERD: Place = { id: 1, lat: 47.3919, lng: 18.9045 };
const DEBRECEN: Place = { id: 2, lat: 47.5316, lng: 21.6273 };
const SOPRON: Place = { id: 4, lat: 47.6817, lng: 16.5845 };
const A: Machine = { id: 1, name: "A", base: ERD };
const B: Machine = { id: 2, name: "B", base: ERD };

const d = (m: number, day: number, h = 0) => atLocal({ y: 2026, m, d: day }, h * 60);
const key = (x: Date) => localDay(x).key;
let nextId = 1;
const stop = (m: number, day: number, h: number, place: Place | null, machineId = 1, minutes = 90): RouteStop => ({
  id: nextId++,
  machineId,
  startsAt: d(m, day, h),
  minutes,
  place,
});
const base = (o: Partial<RouteSlotsInput>): RouteSlotsInput => ({
  place: DEBRECEN,
  minutes: 90,
  machines: [A],
  stops: [],
  from: d(11, 23, 6), // Monday
  days: 10,
  count: 3,
  cfg,
  drive,
  ...o,
});

describe("proposeRouteSlots", () => {
  it("returns only feasible slots, never on weekends, one per day", () => {
    const slots = proposeRouteSlots(base({ from: d(11, 27, 6), days: 8, count: 10 }));
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.feasible).toBe(true);
      expect([0, 6]).not.toContain(localDay(s.startsAt).dow);
    }
    expect(new Set(slots.map((s) => key(s.startsAt))).size).toBe(slots.length);
  });

  it("ranks the day with a Debrecen booking first as same_trip", () => {
    const stops = [stop(11, 25, 10, DEBRECEN)];
    const slots = proposeRouteSlots(base({ stops }));
    expect(key(slots[0].startsAt)).toBe("2026-11-25");
    expect(slots[0].reason).toBe("same_trip");
    expect(slots[0].addedDriveMinutes).toBeLessThan(60);
  });

  it("urgent flips a far bundle to an empty earlier day", () => {
    const stops = [stop(12, 7, 10, DEBRECEN)]; // 10 working days after Mon 11-23
    const calm = proposeRouteSlots(base({ stops, days: 20 }));
    expect(key(calm[0].startsAt)).toBe("2026-12-07");
    const urgent = proposeRouteSlots(base({ stops, days: 20, urgent: true }));
    expect(key(urgent[0].startsAt)).toBe("2026-11-23");
  });

  it("uses machine B when machine A is full", () => {
    const stops = [stop(11, 25, 8, null), stop(11, 25, 10, null), stop(11, 25, 13, null)];
    const slots = proposeRouteSlots(base({ machines: [A, B], stops, from: d(11, 25, 0), days: 1, count: 1 }));
    expect(slots).toHaveLength(1);
    expect(slots[0].machineId).toBe(2);
  });

  it("bundle hint on another day carries a feasible suggestion", () => {
    const stops = [stop(11, 25, 10, SOPRON)];
    const slots = proposeRouteSlots(
      base({ place: SOPRON, machines: [A, B], stops, from: d(11, 27, 0), days: 1, count: 1 }),
    );
    expect(slots).toHaveLength(1);
    const hint = slots[0].bundles[0];
    expect(hint).toMatchObject({ tier: "same_city", sameDay: false, workingDaysApart: 2 });
    expect(key(hint.suggestedStart!)).toBe("2026-11-25");
    const machine = hint.suggestedMachineId === 1 ? A : B;
    const re = checkPlacement(
      { machineId: machine.id, startsAt: hint.suggestedStart!, minutes: 90, place: SOPRON },
      stops,
      machine,
      cfg,
      drive,
    );
    expect(re.feasible).toBe(true);
  });

  it("bestOnDay skips weekends and leaves bundles empty", () => {
    const sat = localDay(d(11, 28, 12));
    expect(bestOnDay(sat, base({}))).toBeNull();
    expect(bestOnDay(localDay(d(11, 25, 12)), base({ from: d(11, 25, 0) }))?.bundles).toEqual([]);
  });

  it("adds a different-week pick", () => {
    const slots = proposeRouteSlots(base({ days: 14, count: 3 }));
    const weeks = new Set(slots.map((s) => localDay(s.startsAt)).map((x) => (x.m === 11 && x.d < 30 ? "w1" : "w2")));
    expect(slots).toHaveLength(3);
    expect(weeks.size).toBeGreaterThan(1);
  });
});
