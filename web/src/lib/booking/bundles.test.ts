import { describe, it, expect } from "vitest";
import { nearbyBookings, tierFor } from "./bundles";
import { DEFAULT_BOOKING_CONFIG as cfg } from "./config";
import type { RouteStop } from "./route-types";
import { atLocal } from "./time";
import { straightLineSource as drive, type Place } from "./travel";

const SOPRON: Place = { id: 4, lat: 47.6817, lng: 16.5845 };
const DEBRECEN: Place = { id: 2, lat: 47.5316, lng: 21.6273 };
const d = (day: number, h: number) => atLocal({ y: 2026, m: 11, d: day }, h * 60);
const stop = (id: number, day: number, place: Place | null): RouteStop => ({
  id,
  machineId: 1,
  startsAt: d(day, 10),
  minutes: 90,
  place,
});

describe("tierFor", () => {
  it("boundaries", () => {
    expect(tierFor(10, cfg)).toBe("same_city");
    expect(tierFor(11, cfg)).toBe("near");
    expect(tierFor(30, cfg)).toBe("near");
    expect(tierFor(60, cfg)).toBe("in_area");
    expect(tierFor(61, cfg)).toBeNull();
  });
});

describe("nearbyBookings", () => {
  it("finds a same-town booking two working days earlier", () => {
    const hints = nearbyBookings({ place: SOPRON, startsAt: d(27, 10), stops: [stop(1, 25, SOPRON)], cfg, drive });
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({ tier: "same_city", sameDay: false, workingDaysApart: 2 });
  });

  it("null place, far away, excluded and out-of-window stops are dropped", () => {
    const far = stop(2, 25, DEBRECEN);
    const own = stop(3, 25, SOPRON);
    const late = stop(4, 25 + 30, SOPRON);
    late.startsAt = atLocal({ y: 2027, m: 1, d: 20 }, 600);
    expect(nearbyBookings({ place: null, startsAt: d(27, 10), stops: [own], cfg, drive })).toEqual([]);
    expect(
      nearbyBookings({ place: SOPRON, startsAt: d(27, 10), stops: [far, own, late], cfg, drive, excludeId: 3 }),
    ).toEqual([]);
  });

  it("sorts same day first, then tier", () => {
    const near: Place = { id: 9, lat: 47.6817, lng: 16.9 }; // a few km: same town band is 10, so near/same_city
    const hints = nearbyBookings({
      place: SOPRON,
      startsAt: d(27, 10),
      stops: [stop(1, 26, SOPRON), stop(2, 27, near)],
      cfg,
      drive,
    });
    expect(hints[0].stop.id).toBe(2);
    expect(hints[0].sameDay).toBe(true);
  });
});
