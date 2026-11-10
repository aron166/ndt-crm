import type { BookingConfig } from "./config";
import type { BundleHint, BundleTier, RouteStop } from "./route-types";
import { localDay, workingDaysBetween, type LocalDay } from "./time";
import { midMinutes, type DriveTimeSource, type Place } from "./travel";

/** "Who else is near this site, and when?" (W8b plan 2.6, 2.7.) PURE module. */

export function tierFor(minutes: number, cfg: BookingConfig): BundleTier | null {
  if (minutes <= cfg.tierSameCity) return "same_city";
  if (minutes <= cfg.tierNear) return "near";
  if (minutes <= cfg.tierArea) return "in_area";
  return null;
}

const TIER_ORDER: Record<BundleTier, number> = { same_city: 0, near: 1, in_area: 2 };

export interface NearbyInput {
  place: Place | null;
  startsAt: Date;
  stops: RouteStop[];
  cfg: BookingConfig;
  drive: DriveTimeSource;
  excludeId?: number;
  suggest?: (day: LocalDay, stop: RouteStop) => { startsAt: Date; machineId: number } | null;
}

export function nearbyBookings(input: NearbyInput): BundleHint[] {
  const { place, cfg, drive } = input;
  if (!place) return [];
  const day = localDay(input.startsAt);
  const hints: BundleHint[] = [];
  for (const stop of input.stops) {
    if (!stop.place || stop.id === input.excludeId) continue;
    const stopDay = localDay(stop.startsAt);
    const workingDaysApart =
      stopDay.key >= day.key ? workingDaysBetween(day, stopDay) : workingDaysBetween(stopDay, day);
    if (workingDaysApart > cfg.bundleWindowWorkingDays) continue;
    const driveMinutes = midMinutes(drive.minutes(place, stop.place));
    const tier = tierFor(driveMinutes, cfg);
    if (!tier) continue;
    const sameDay = stopDay.key === day.key;
    const hint: BundleHint = { stop, sameDay, driveMinutes, tier, workingDaysApart };
    if (!sameDay && input.suggest) {
      const s = input.suggest(stopDay, stop);
      hint.suggestedStart = s ? s.startsAt : null;
      hint.suggestedMachineId = s ? s.machineId : null;
    }
    hints.push(hint);
  }
  return hints.sort(
    (a, b) =>
      Number(b.sameDay) - Number(a.sameDay) ||
      TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
      a.driveMinutes - b.driveMinutes ||
      a.workingDaysApart - b.workingDaysApart,
  );
}
