import { bookingRank, type BookingPriorityInput } from "./priority";

/**
 * Overlap detection + the bumping rule (BACKLOG 2026-09-12 item 2).
 *
 * Péter's rule is explicit: when a higher-priority booking lands on top of a
 * lower one, the lower one is FLAGGED for bumping — never auto-cancelled. A
 * customer whose appointment vanished without a phone call is a customer lost,
 * and no scheduling heuristic is worth that. So this module only ever returns
 * "these two collide and this is the one you could move"; moving it is a human
 * pressing a button.
 *
 * PURE module: takes bookings, returns conflicts.
 */

export interface Booking extends BookingPriorityInput {
  id: number;
  startsAt: Date;
  /** Minutes. Missing/0 falls back to DEFAULT_BOOKING_MINUTES. */
  minutes?: number | null;
  /** Who is going. Two people can be in two places at once; one cannot. */
  assignedToId?: number | null;
}

/** A site visit nobody has estimated still blocks a chunk of the day. */
export const DEFAULT_BOOKING_MINUTES = 90;
/** Travel buffer around a booking when comparing two of them (minutes). */
export const TRAVEL_BUFFER_MINUTES = 30;

export interface BookingConflict {
  /** The booking that keeps its slot. */
  keep: Booking;
  /** The lower-priority booking a human may choose to move. */
  bump: Booking;
  overlapMinutes: number;
}

function endOf(b: Booking): number {
  const minutes = b.minutes && b.minutes > 0 ? b.minutes : DEFAULT_BOOKING_MINUTES;
  return b.startsAt.getTime() + minutes * 60_000;
}

/**
 * Do two bookings collide? Returns the minutes of collision, 0 when they are
 * fine. Same person only — two people can be in two places at once.
 *
 * A collision is either a real overlap, OR a gap smaller than the travel
 * buffer: two visits at two addresses that the clock says just fit are still a
 * conflict, because nobody teleports. In the second case the number returned is
 * how far into the travel buffer they eat.
 *
 * (Padding BOTH ends and subtracting the buffer again is the obvious-looking
 * version and is wrong — the terms cancel algebraically and the buffer does
 * nothing. Caught by the test that asserts back-to-back bookings conflict.)
 */
export function overlapMinutes(a: Booking, b: Booking): number {
  const sameOwner =
    a.assignedToId != null && b.assignedToId != null && a.assignedToId === b.assignedToId;
  if (!sameOwner) return 0;

  const start = Math.max(a.startsAt.getTime(), b.startsAt.getTime());
  const end = Math.min(endOf(a), endOf(b));
  const overlap = end - start;
  if (overlap > 0) return Math.round(overlap / 60_000);

  // Disjoint: `-overlap` is the gap between them.
  const gapMinutes = Math.round(-overlap / 60_000);
  return gapMinutes < TRAVEL_BUFFER_MINUTES ? TRAVEL_BUFFER_MINUTES - gapMinutes : 0;
}

/**
 * Every conflicting pair among these bookings, with the lower-priority one
 * marked as the bumpable side. Equal rank → still reported, but `bump` is the
 * one that was booked LATER: the earlier promise wins, which is the rule a
 * customer would expect if they asked.
 */
export function findConflicts(bookings: Booking[]): BookingConflict[] {
  const out: BookingConflict[] = [];
  const sorted = [...bookings].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const minutes = overlapMinutes(sorted[i], sorted[j]);
      if (minutes <= 0) continue;
      const ri = bookingRank(sorted[i]);
      const rj = bookingRank(sorted[j]);
      // Equal rank: sorted[] is start-ascending, so j is the later promise.
      const [keep, bump] = ri <= rj ? [sorted[i], sorted[j]] : [sorted[j], sorted[i]];
      out.push({ keep, bump, overlapMinutes: minutes });
    }
  }
  return out;
}

/** The conflicts a single candidate booking would create against what exists. */
export function conflictsFor(candidate: Booking, existing: Booking[]): BookingConflict[] {
  return findConflicts([candidate, ...existing]).filter(
    (c) => c.keep.id === candidate.id || c.bump.id === candidate.id,
  );
}
