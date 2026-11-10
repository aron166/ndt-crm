import { nearbyBookings } from "./bundles";
import type { BookingConfig } from "./config";
import { checkPlacement } from "./feasibility";
import type { Machine, RankedSlot, RouteStop, SlotReason } from "./route-types";
import { addDays, atLocal, isWorkingDay, localDay, localMinuteOfDay, workingDaysBetween, type LocalDay } from "./time";
import { midMinutes, type DriveTimeSource, type Place } from "./travel";

/** Ranked, feasible-only slot proposals (W8b plan 2.8). PURE module. */

export interface RouteSlotsInput {
  place: Place | null;
  minutes: number;
  machines: Machine[];
  stops: RouteStop[];
  from: Date;
  days: number;
  count: number;
  cfg: BookingConfig;
  drive: DriveTimeSource;
  wanted?: Date;
  urgent?: boolean;
  excludeId?: number;
  /** Bundle suggestions never start before this (the service passes the start of tomorrow). */
  notBefore?: Date;
}

/** A "tight" leg is possible but risky: among equal slots prefer the one with slack. */
const TIGHT_PENALTY = 10;

/** Lowest-cost feasible slot of one day over all machines; bundles are left empty. */
export function bestOnDay(day: LocalDay, input: RouteSlotsInput): RankedSlot | null {
  if (!isWorkingDay(day)) return null;
  const { cfg, drive, place } = input;
  const wWait = input.urgent ? 60 : cfg.weightWaitPerWorkingDay;
  const wantedDay = localDay(input.wanted ?? input.from);
  const waitCost = wWait * workingDaysBetween(wantedDay, day);
  let best: RankedSlot | null = null;

  for (const machine of input.machines) {
    for (let m = cfg.visitFrom; m + input.minutes <= cfg.visitTo; m += cfg.slotStepMinutes) {
      const startsAt = atLocal(day, m);
      if (startsAt < input.from) continue;
      const r = checkPlacement(
        { id: input.excludeId, machineId: machine.id, startsAt, minutes: input.minutes, place },
        input.stops,
        machine,
        cfg,
        drive,
      );
      if (!r.feasible) continue;
      const idle =
        r.before.stop && r.before.drive && r.before.gapMinutes !== null
          ? Math.max(0, r.before.gapMinutes - (r.before.drive.max + cfg.siteBufferMinutes))
          : 0;
      const homeMinute = r.homeAt ? localMinuteOfDay(r.homeAt) : 0;
      const cost =
        Math.round(
          (r.addedDriveMinutes +
            waitCost +
            cfg.weightIdlePerMinute * Math.min(idle, cfg.idleCapMinutes) +
            cfg.weightLatePerMinute * Math.max(0, homeMinute - cfg.lateFrom) +
            TIGHT_PENALTY * r.flags.filter((f) => f.code === "tight").length) *
            10,
        ) / 10;
      if (best) {
        const t = r.startsAt.getTime() - best.startsAt.getTime();
        if (cost > best.cost || (cost === best.cost && (t > 0 || (t === 0 && r.machineId >= best.machineId)))) continue;
      }
      let reason: SlotReason;
      if (place && r.dayStops.some((s) => s.place && midMinutes(drive.minutes(place, s.place)) <= cfg.tierArea)) {
        reason = "same_trip";
      } else if (r.dayStops.length > 0 && r.addedDriveMinutes <= cfg.tierArea) reason = "on_the_way";
      else if (r.dayStops.length === 0) reason = "free_day";
      else reason = "next_free";
      best = { ...r, cost, reason, bundles: [] };
    }
  }
  return best;
}

const weekKey = (d: LocalDay) => addDays(d, -((d.dow + 6) % 7)).key;

export function proposeRouteSlots(input: RouteSlotsInput): RankedSlot[] {
  const first = localDay(input.from);
  const found: RankedSlot[] = [];
  for (let i = 0; i < input.days; i++) {
    const s = bestOnDay(addDays(first, i), input);
    if (s) found.push(s);
  }
  const byCost = [...found].sort((a, b) => a.cost - b.cost || a.startsAt.getTime() - b.startsAt.getTime());
  const picks: RankedSlot[] = [];
  const add = (s: RankedSlot | undefined) => {
    if (s && !picks.includes(s)) picks.push(s);
  };

  add(byCost[0]);
  const earliest = found[0];
  if (earliest && !picks.includes(earliest)) {
    if (earliest.reason !== "same_trip" && earliest.reason !== "on_the_way") earliest.reason = "earliest";
    add(earliest);
  }
  const weeks = () => new Set(picks.map((p) => weekKey(localDay(p.startsAt))));
  add(byCost.find((s) => !weeks().has(weekKey(localDay(s.startsAt)))));
  for (const s of byCost) add(s);

  return picks.slice(0, input.count).map((s) => ({
    ...s,
    bundles: nearbyBookings({
      place: input.place,
      startsAt: s.startsAt,
      stops: input.stops,
      cfg: input.cfg,
      drive: input.drive,
      excludeId: input.excludeId,
      suggest: (d) => {
        // A bundle day may be earlier than `from` (the kind's lead time binds proposals only), never before `notBefore`.
        const dayStart = atLocal(d, 0);
        const floor = input.notBefore && input.notBefore > dayStart ? input.notBefore : dayStart;
        const b = bestOnDay(d, { ...input, from: floor, days: 1 });
        return b && { startsAt: b.startsAt, machineId: b.machineId };
      },
    }),
  }));
}
