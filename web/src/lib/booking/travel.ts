import { haversineKm } from "./slots";

/**
 * Drive time between two job sites (W8b plan 2.2). Unit: minutes, never km.
 *
 * Slice 1 source is a BAND from the straight-line distance, calibrated on nine
 * Hungarian pairs routed on OSRM (2026-11-10): long motorway legs run 0.80-0.88
 * min per straight km, short regional legs 1.1-1.5, so one multiplier is wrong
 * at both ends. `min` is "cannot be quicker", `max` is "will not be slower".
 * A gap below `min` is impossible for certain; above `max` is fine for certain.
 *
 * Everything downstream reads a `DriveTimeSource`, so the OSRM matrix (slice 2,
 * N4) replaces this by returning min === max for pairs it has a row for.
 *
 * PURE module.
 */

/** A settlement (or Budapest district) centroid. `id` is hu_settlements.id. */
export interface Place {
  id: number;
  lat: number;
  lng: number;
  name?: string;
}

export interface DriveBand {
  min: number;
  max: number;
}

export interface DriveTimeSource {
  minutes(from: Place, to: Place): DriveBand;
}

/** Same settlement: parking to parking inside one town. */
export const SAME_SETTLEMENT_MINUTES = 10;

export function straightLineBand(from: Place, to: Place): DriveBand {
  if (from.id === to.id) return { min: SAME_SETTLEMENT_MINUTES, max: SAME_SETTLEMENT_MINUTES };
  const km = haversineKm(from, to);
  const min = Math.max(SAME_SETTLEMENT_MINUTES, Math.round(0.75 * km));
  const max = Math.max(min, Math.round(12 + 1.3 * km));
  return { min, max };
}

export const straightLineSource: DriveTimeSource = { minutes: straightLineBand };

/** One number for ranking and tiers: the middle of the band (exact when min === max). */
export function midMinutes(b: DriveBand): number {
  return Math.round((b.min + b.max) / 2);
}
