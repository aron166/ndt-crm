import { DEFAULT_BOOKING_MINUTES, TRAVEL_BUFFER_MINUTES, overlapMinutes, type Booking } from "./conflicts";

/**
 * "Propose three route-checked slots" (BACKLOG 2026-09-12 item 2).
 *
 * Route-checked, not routed: we never ask Google for a road distance here. The
 * Maps integration in this repo does geocoding only, most companies have no
 * coordinates yet (`geocodeCompany` is a manual per-company button), and a
 * Distance Matrix call per candidate slot would be a lot of quota to decide
 * something a straight line already decides well enough — the question is "is
 * this near where I already have to be that day?", not "how many minutes on the
 * M1?". A road-distance upgrade drops in at `travelKm` without touching the
 * ranking: see the ponytail note below.
 *
 * PURE module: dates and numbers in, ranked slots out.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface SlotBooking extends Booking {
  /** Where this visit is. Missing coordinates simply cannot help the routing. */
  point?: GeoPoint | null;
}

export interface SlotProposal {
  startsAt: Date;
  /** Straight-line km to the nearest other booking that day, null if alone. */
  nearestKm: number | null;
  /** Why this slot is being offered — rendered to the user as-is. */
  reason: "same_area" | "free_day" | "next_free";
}

export interface ProposeSlotsInput {
  /** Where the new visit is. Null = we know nothing, so distance cannot rank. */
  target: GeoPoint | null;
  existing: SlotBooking[];
  /** Earliest acceptable start (usually now + a day). */
  from: Date;
  /** How many days ahead to look. Péter books about a week out. */
  days?: number;
  minutes?: number;
  assignedToId?: number | null;
  /** Local workday, 24h clock. */
  dayStartHour?: number;
  dayEndHour?: number;
  /** How many proposals to return. */
  count?: number;
  /** Under this distance, two visits count as "the same area". */
  sameAreaKm?: number;
}

const EARTH_RADIUS_KM = 6371;

/** Straight-line distance. ponytail: swap for a Distance Matrix call the day
 * the Google key is configured AND companies actually have coordinates — the
 * ranking below only reads `nearestKm`, so nothing else changes. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function atHour(day: Date, hour: number): Date {
  const x = startOfDay(day);
  x.setHours(hour, 0, 0, 0);
  return x;
}

/**
 * Candidate starts on one day: every half hour inside the workday that leaves
 * room for the visit and collides with nothing already booked.
 */
function freeStartsOnDay(
  day: Date,
  input: Required<Pick<ProposeSlotsInput, "minutes" | "dayStartHour" | "dayEndHour">> & {
    existing: SlotBooking[];
    assignedToId: number | null;
    from: Date;
  },
): Date[] {
  const out: Date[] = [];
  const lastStart = atHour(day, input.dayEndHour).getTime() - input.minutes * 60_000;
  for (let t = atHour(day, input.dayStartHour).getTime(); t <= lastStart; t += 30 * 60_000) {
    const startsAt = new Date(t);
    if (startsAt < input.from) continue;
    const candidate: SlotBooking = {
      id: -1,
      startsAt,
      minutes: input.minutes,
      assignedToId: input.assignedToId,
      kind: null,
    };
    const clash = input.existing.some((b) => overlapMinutes(candidate, b) > 0);
    if (!clash) out.push(startsAt);
  }
  return out;
}

export function proposeSlots(input: ProposeSlotsInput): SlotProposal[] {
  const minutes = input.minutes && input.minutes > 0 ? input.minutes : DEFAULT_BOOKING_MINUTES;
  const days = input.days ?? 10;
  const count = input.count ?? 3;
  const sameAreaKm = input.sameAreaKm ?? 40;
  const dayStartHour = input.dayStartHour ?? 8;
  const dayEndHour = input.dayEndHour ?? 17;
  const assignedToId = input.assignedToId ?? null;

  const perDay: SlotProposal[] = [];

  for (let i = 0; i < days; i++) {
    const day = startOfDay(new Date(input.from.getTime() + i * 86_400_000));
    // Saturday/Sunday: Péter does not book weekends.
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;

    const sameDay = input.existing.filter(
      (b) => startOfDay(b.startsAt).getTime() === day.getTime(),
    );
    const free = freeStartsOnDay(day, {
      minutes,
      dayStartHour,
      dayEndHour,
      existing: input.existing,
      assignedToId,
      from: input.from,
    });
    if (free.length === 0) continue;

    const nearestKm =
      input.target == null
        ? null
        : sameDay.reduce<number | null>((best, b) => {
            if (!b.point) return best;
            const km = haversineKm(input.target!, b.point);
            return best === null || km < best ? km : best;
          }, null);

    // One proposal per day: the day is the decision, the hour is negotiable.
    // Prefer the start that sits right after an existing visit when we are
    // already in the area, otherwise the first free slot of the day.
    let startsAt = free[0];
    if (nearestKm !== null && nearestKm <= sameAreaKm && sameDay.length > 0) {
      const lastEnd = Math.max(
        ...sameDay.map(
          (b) => b.startsAt.getTime() + (b.minutes && b.minutes > 0 ? b.minutes : DEFAULT_BOOKING_MINUTES) * 60_000,
        ),
      );
      const after = free.find((s) => s.getTime() >= lastEnd + TRAVEL_BUFFER_MINUTES * 60_000);
      if (after) startsAt = after;
    }

    const reason: SlotProposal["reason"] =
      nearestKm !== null && nearestKm <= sameAreaKm
        ? "same_area"
        : sameDay.length === 0
          ? "free_day"
          : "next_free";

    perDay.push({ startsAt, nearestKm, reason });
  }

  // Rank: being in the area beats an empty day beats "whenever"; ties go to the
  // earlier date, because a slot a week out is worth less than one tomorrow.
  const reasonRank = { same_area: 0, free_day: 1, next_free: 2 } as const;
  return perDay
    .sort((a, b) => {
      if (reasonRank[a.reason] !== reasonRank[b.reason]) return reasonRank[a.reason] - reasonRank[b.reason];
      if (a.reason === "same_area" && b.reason === "same_area") {
        return (a.nearestKm ?? Infinity) - (b.nearestKm ?? Infinity);
      }
      return a.startsAt.getTime() - b.startsAt.getTime();
    })
    .slice(0, count);
}
