import { describe, it, expect } from "vitest";
import { bookingConfigFromSettings, DEFAULT_BOOKING_CONFIG as cfg } from "./config";
import { checkPlacement } from "./feasibility";
import type { Machine, RouteStop } from "./route-types";
import { atLocal, localDay } from "./time";
import { midMinutes, straightLineBand, straightLineSource as drive, type Place } from "./travel";

export const ERD: Place = { id: 1, lat: 47.3919, lng: 18.9045, name: "Erd" };
export const DEBRECEN: Place = { id: 2, lat: 47.5316, lng: 21.6273, name: "Debrecen" };
export const ZALA: Place = { id: 3, lat: 46.8417, lng: 16.8416, name: "Zalaegerszeg" };
export const SOPRON: Place = { id: 4, lat: 47.6817, lng: 16.5845, name: "Sopron" };

const DAY = localDay(atLocal({ y: 2026, m: 11, d: 25 }, 0)); // Wednesday
const at = (h: number, m = 0) => atLocal(DAY, h * 60 + m);
const A: Machine = { id: 1, name: "A", base: ERD };
const B: Machine = { id: 2, name: "B", base: ERD };
let nextId = 100;
const stop = (h: number, m: number, minutes: number, place: Place | null, machineId = 1): RouteStop => ({
  id: nextId++,
  machineId,
  startsAt: at(h, m),
  minutes,
  place,
});
const cand = (h: number, m: number, minutes: number, place: Place | null) => ({
  machineId: 1,
  startsAt: at(h, m),
  minutes,
  place,
});
const codes = (r: { flags: { code: string }[] }) => r.flags.map((f) => f.code);

describe("straightLineBand against OSRM reference pairs", () => {
  const P = (id: number, lat: number, lng: number): Place => ({ id, lat, lng });
  const pairs: [string, Place, Place, number][] = [
    ["Erd-Debrecen", ERD, DEBRECEN, 173],
    ["Erd-Sopron", ERD, SOPRON, 142],
    ["Erd-Zalaegerszeg", ERD, ZALA, 149],
    ["Debrecen-Zalaegerszeg", DEBRECEN, ZALA, 310],
    ["Sopron-Gyor", SOPRON, P(5, 47.6875, 17.6504), 76],
    ["Debrecen-Nyiregyhaza", DEBRECEN, P(7, 47.9554, 21.7167), 54],
    ["Debrecen-Hajduszoboszlo", DEBRECEN, P(6, 47.4436, 21.3925), 26],
    ["Sopron-Koszeg", SOPRON, P(8, 47.3897, 16.5408), 50],
    ["Bekescsaba-Debrecen", P(9, 46.6736, 21.0877), DEBRECEN, 129],
  ];
  for (const [name, a, b, osrm] of pairs) {
    it(name, () => {
      const band = straightLineBand(a, b);
      expect(band.min).toBeLessThanOrEqual(osrm);
      expect(band.max).toBeGreaterThanOrEqual(osrm);
    });
  }
});

describe("checkPlacement", () => {
  it("Debrecen then Zalaegerszeg the same day is never feasible", () => {
    const stops = [stop(14, 0, 90, DEBRECEN)];
    for (const h of [15, 16, 17]) {
      const r = checkPlacement(cand(h, 0, 90, ZALA), stops, A, cfg, drive);
      expect(r.feasible).toBe(false);
      if (h === 15) expect(codes(r)).toContain("machine_clash");
      else {
        const f = r.flags.find((x) => x.code === "infeasible" && x.leg === "before");
        expect(f?.earliestStart && f.earliestStart > at(20, 0)).toBe(true);
      }
      if (h === 17) expect(codes(r)).toContain("outside_window");
    }
  });

  it("same town back to back: 25 min gap ok, 20 min not", () => {
    const stops = [stop(10, 0, 90, SOPRON)];
    const ok = checkPlacement(cand(11, 55, 60, SOPRON), stops, A, cfg, drive);
    expect(ok.feasible).toBe(true);
    const no = checkPlacement(cand(11, 50, 60, SOPRON), stops, A, cfg, drive);
    expect(no.feasible).toBe(false);
    expect(no.flags.find((f) => f.leg === "before")?.earliestStart).toEqual(at(11, 55));
  });

  it("after leg carries latestStart", () => {
    const stops = [stop(14, 0, 60, SOPRON)];
    const r = checkPlacement(cand(12, 45, 60, SOPRON), stops, A, cfg, drive);
    const f = r.flags.find((x) => x.code === "infeasible" && x.leg === "after");
    expect(f?.latestStart).toEqual(at(12, 35));
  });

  it("two machines: clash only on the busy machine", () => {
    const stops = [stop(10, 0, 90, DEBRECEN, 1)];
    const onB = checkPlacement({ ...cand(10, 0, 90, ZALA), machineId: 2 }, stops, B, cfg, drive);
    expect(onB.feasible).toBe(true);
    expect(codes(onB)).not.toContain("machine_clash");
    const onA = checkPlacement(cand(10, 0, 90, ZALA), stops, A, cfg, drive);
    expect(codes(onA)).toContain("machine_clash");
    expect(onA.feasible).toBe(false);
  });

  it("no place: flat 30 gap and a single no_site", () => {
    const stops = [stop(10, 0, 90, SOPRON), stop(14, 0, 60, SOPRON)];
    const ok = checkPlacement(cand(12, 0, 30, null), stops, A, cfg, drive);
    expect(ok.feasible).toBe(true);
    expect(codes(ok).filter((c) => c === "no_site")).toHaveLength(1);
    const no = checkPlacement(cand(11, 45, 60, null), [stops[0]], A, cfg, drive);
    expect(no.feasible).toBe(false);
    expect(codes(no).filter((c) => c === "no_site")).toHaveLength(1);
  });

  it("machine_clash earliestStart adds the drive from the clashing stop", () => {
    const stops = [stop(10, 0, 90, SOPRON)];
    const r = checkPlacement(cand(11, 0, 60, DEBRECEN), stops, A, cfg, drive);
    const f = r.flags.find((x) => x.code === "machine_clash");
    expect(f?.earliestStart).toEqual(
      new Date(at(11, 30).getTime() + (straightLineBand(SOPRON, DEBRECEN).min + cfg.siteBufferMinutes) * 60_000),
    );
    const n = checkPlacement(cand(11, 0, 60, null), stops, A, cfg, drive);
    expect(n.flags.find((x) => x.code === "machine_clash")?.earliestStart).toEqual(at(12, 0));
  });

  it("earliestStart is clamped to visitFrom", () => {
    const stops = [stop(5, 0, 30, null)];
    const r = checkPlacement(cand(5, 10, 30, null), stops, A, cfg, drive);
    expect(r.flags.find((x) => x.code === "machine_clash")?.earliestStart).toEqual(atLocal(DAY, cfg.visitFrom));
    const b = checkPlacement(cand(5, 40, 30, null), stops, A, cfg, drive);
    expect(b.flags.find((x) => x.leg === "before")?.earliestStart).toEqual(atLocal(DAY, cfg.visitFrom));
  });

  it("a candidate without a place gets one no_site even alone on the day", () => {
    const r = checkPlacement(cand(10, 0, 60, null), [], A, cfg, drive);
    expect(codes(r).filter((c) => c === "no_site")).toHaveLength(1);
  });

  it("from_base: Debrecen at 07:00 infeasible, 10:00 feasible", () => {
    const early = checkPlacement(cand(7, 0, 90, DEBRECEN), [], A, cfg, drive);
    expect(early.feasible).toBe(false);
    const f = early.flags.find((x) => x.leg === "from_base");
    expect(f?.earliestStart).toEqual(atLocal(DAY, cfg.leaveBaseFrom + straightLineBand(ERD, DEBRECEN).min));
    expect(f!.earliestStart! > at(8, 0)).toBe(true);
    expect(checkPlacement(cand(10, 0, 90, DEBRECEN), [], A, cfg, drive).feasible).toBe(true);
  });

  it("to_base: late return is long_day, not a block", () => {
    const z = checkPlacement(cand(15, 0, 90, ZALA), [], A, cfg, drive);
    const mid = midMinutes(straightLineBand(ZALA, ERD));
    expect(codes(z).includes("long_day")).toBe(16 * 60 + 30 + mid > cfg.homeBy);
    const d = checkPlacement(cand(15, 30, 90, DEBRECEN), [], A, cfg, drive);
    expect(d.feasible).toBe(true);
    expect(codes(d).filter((c) => c === "long_day")).toHaveLength(1);
    expect(d.flags.find((f) => f.code === "long_day")?.leg).toBe("to_base");
  });

  it("day_full and outside_window", () => {
    const stops = [stop(8, 0, 30, null), stop(10, 0, 30, null), stop(12, 0, 30, null)];
    expect(codes(checkPlacement(cand(15, 0, 30, null), stops, A, cfg, drive))).toContain("day_full");
    expect(codes(checkPlacement(cand(6, 30, 30, SOPRON), [], A, cfg, drive))).toContain("outside_window");
    expect(codes(checkPlacement(cand(16, 0, 90, SOPRON), [], A, cfg, drive))).toContain("outside_window");
  });

  it("excludes the moved booking itself", () => {
    const s = stop(10, 0, 60, SOPRON);
    const r = checkPlacement({ ...cand(10, 0, 60, SOPRON), id: s.id }, [s], A, cfg, drive);
    expect(r.dayStops).toHaveLength(0);
    expect(r.feasible).toBe(true);
  });
});

describe("bookingConfigFromSettings", () => {
  it("ignores an invalid key and keeps a valid override", () => {
    const c = bookingConfigFromSettings({ booking: { tierNear: "x", slotStepMinutes: 15, nope: 1 } });
    expect(c.tierNear).toBe(cfg.tierNear);
    expect(c.slotStepMinutes).toBe(15);
  });
});
