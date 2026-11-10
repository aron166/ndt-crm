import type { BookingConfig } from "./config";
import type { Candidate, Flag, Leg, LegInfo, Machine, PlacementResult, RouteStop } from "./route-types";
import { atLocal, localDay, localMinuteOfDay } from "./time";
import { midMinutes, type DriveBand, type DriveTimeSource, type Place } from "./travel";

/**
 * Can this booking be placed on this machine's day? (W8b plan 2.2 to 2.7.)
 * Every check is a flag; `feasible` is "no block flag". PURE module.
 */

const MIN = 60_000;
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * MIN);
const endOf = (s: { startsAt: Date; minutes: number }) => addMin(s.startsAt, s.minutes);
const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / MIN);

interface Item {
  startsAt: Date;
  minutes: number;
  place: Place | null;
}

/** Mid-band driving base -> items (time order) -> base; legs touching an unknown place count 0. */
function driveSum(items: Item[], base: Place, drive: DriveTimeSource): number {
  if (items.length === 0) return 0;
  const route: (Place | null)[] = [base, ...items.map((i) => i.place), base];
  let sum = 0;
  for (let i = 0; i + 1 < route.length; i++) {
    const a = route[i];
    const b = route[i + 1];
    if (a && b) sum += midMinutes(drive.minutes(a, b));
  }
  return sum;
}

export function checkPlacement(
  candidate: Candidate,
  stops: RouteStop[],
  machine: Machine,
  cfg: BookingConfig,
  drive: DriveTimeSource,
): PlacementResult {
  const start = candidate.startsAt;
  const end = addMin(start, candidate.minutes);
  const day = localDay(start);
  const startMin = localMinuteOfDay(start);
  const flags: Flag[] = [];

  const dayStops = stops
    .filter((s) => s.machineId === machine.id && s.id !== candidate.id && localDay(s.startsAt).key === day.key)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const floor = atLocal(day, cfg.visitFrom);
  const clamp = (d: Date) => (d < floor ? floor : d);

  for (const s of dayStops) {
    if (s.startsAt < end && start < endOf(s)) {
      const need =
        s.place && candidate.place ? drive.minutes(s.place, candidate.place).min + cfg.siteBufferMinutes : cfg.noSiteGapMinutes;
      flags.push({ code: "machine_clash", severity: "block", againstId: s.id, earliestStart: clamp(addMin(endOf(s), need)) });
    }
  }

  const prev = [...dayStops].reverse().find((s) => endOf(s) <= start) ?? null;
  const next = dayStops.find((s) => s.startsAt >= end) ?? null;

  let noSite = !candidate.place;
  const legCheck = (leg: Leg, other: RouteStop): LegInfo => {
    const before = leg === "before";
    const aPlace = before ? other.place : candidate.place;
    const bPlace = before ? candidate.place : other.place;
    const gap = minutesBetween(before ? endOf(other) : end, before ? start : other.startsAt);
    let band: DriveBand | null = null;
    let need = cfg.noSiteGapMinutes;
    let needMax = need;
    if (aPlace && bPlace) {
      band = drive.minutes(aPlace, bPlace);
      need = band.min + cfg.siteBufferMinutes;
      needMax = band.max + cfg.siteBufferMinutes;
    } else {
      noSite = true;
    }
    const slack = gap - needMax;
    const base: Flag = { code: "infeasible", severity: "block", leg, againstId: other.id, gapMinutes: gap, slackMinutes: slack };
    if (band) base.drive = band;
    if (gap < need) {
      if (before) base.earliestStart = clamp(addMin(endOf(other), need));
      else base.latestStart = addMin(other.startsAt, -need - candidate.minutes);
      flags.push(base);
    } else if (band && slack < cfg.tightSlackMinutes) {
      flags.push({ ...base, code: "tight", severity: "warn" });
    }
    return { stop: other, drive: band, gapMinutes: gap };
  };

  const beforeLeg: LegInfo = prev ? legCheck("before", prev) : { stop: null, drive: null, gapMinutes: null };
  const afterLeg: LegInfo = next ? legCheck("after", next) : { stop: null, drive: null, gapMinutes: null };
  if (noSite) flags.push({ code: "no_site", severity: "warn" });

  if (!prev && candidate.place) {
    const band = drive.minutes(machine.base, candidate.place);
    beforeLeg.drive = band;
    if (startMin - band.min < cfg.leaveBaseFrom) {
      flags.push({
        code: "infeasible",
        severity: "block",
        leg: "from_base",
        drive: band,
        earliestStart: clamp(atLocal(day, cfg.leaveBaseFrom + band.min)),
      });
    } else if (startMin - band.max < cfg.leaveBaseFrom) {
      flags.push({ code: "tight", severity: "warn", leg: "from_base", drive: band });
    }
  }

  const endMin = localMinuteOfDay(end);
  let homeBand: DriveBand | null = null;
  if (candidate.place) {
    homeBand = drive.minutes(candidate.place, machine.base);
    if (!next) {
      afterLeg.drive = homeBand;
      if (endMin + midMinutes(homeBand) > cfg.homeBy) {
        flags.push({ code: "long_day", severity: "warn", leg: "to_base", drive: homeBand });
      }
    }
  }

  if (startMin < cfg.visitFrom || endMin > cfg.visitTo || localDay(end).key !== day.key) {
    flags.push({ code: "outside_window", severity: "block" });
  }
  if (dayStops.length >= cfg.maxVisitsPerDay) flags.push({ code: "day_full", severity: "block" });

  const me: Item = { startsAt: start, minutes: candidate.minutes, place: candidate.place };
  const withMe = [...dayStops, me].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const dayDriveMinutes = driveSum(withMe, machine.base, drive);
  const addedDriveMinutes = dayDriveMinutes - driveSum(dayStops, machine.base, drive);
  if (dayDriveMinutes > cfg.longDayDriveMinutes && !flags.some((f) => f.code === "long_day")) {
    flags.push({ code: "long_day", severity: "warn" });
  }

  const first = withMe[0];
  const last = withMe[withMe.length - 1];
  const leaveBaseAt = first.place ? addMin(first.startsAt, -drive.minutes(machine.base, first.place).max) : null;
  const homeAt = last.place ? addMin(endOf(last), drive.minutes(last.place, machine.base).max) : null;

  return {
    machineId: machine.id,
    startsAt: start,
    endsAt: end,
    feasible: !flags.some((f) => f.severity === "block"),
    flags,
    before: beforeLeg,
    after: afterLeg,
    dayStops,
    leaveBaseAt,
    homeAt,
    dayDriveMinutes,
    addedDriveMinutes,
  };
}
