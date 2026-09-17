/**
 * Péter's booking priority ladder (BACKLOG 2026-09-12 item 2, "big marbles"):
 *
 *   multi-unit demo  >  single machine demo  >  1M+ job  >  300k+ job  >  private
 *
 * Two rungs are a PROPERTY OF THE BOOKING (how many units is this demo for?),
 * which nothing in the schema could express — hence `tasks.booking_kind`. The
 * two money rungs are DERIVED from what the CRM already knows (the deal's value,
 * or the lead's estimated value), so booking a job never asks for a number
 * somebody has already typed once.
 *
 * PURE module: no DB, no dates. The conflict rule that uses it lives in
 * `conflicts.ts`, the UI reads the labels from here.
 */

export const BOOKING_KINDS = ["multi_unit_demo", "single_machine_demo", "job", "private"] as const;
export type BookingKind = (typeof BOOKING_KINDS)[number];

export const BOOKING_KIND_LABEL: Record<BookingKind, string> = {
  multi_unit_demo: "Több gépes demó",
  single_machine_demo: "Egy gépes demó",
  job: "Munka (felmérés/szolgáltatás)",
  private: "Magánszemély",
};

export function isBookingKind(v: unknown): v is BookingKind {
  return typeof v === "string" && (BOOKING_KINDS as readonly string[]).includes(v);
}

/** The money rungs, in HUF. Áron changes these here, not in five call sites. */
export const JOB_VALUE_HIGH = 1_000_000;
export const JOB_VALUE_MID = 300_000;

/**
 * Lower number = more important, so the ranks sort naturally and a new rung can
 * be slid in between two existing ones without renumbering the world.
 */
export const BOOKING_RANK = {
  MULTI_UNIT_DEMO: 10,
  SINGLE_MACHINE_DEMO: 20,
  JOB_HIGH: 30,
  JOB_MID: 40,
  JOB_LOW: 50,
  PRIVATE: 60,
  UNKNOWN: 99,
} as const;

export interface BookingPriorityInput {
  kind: BookingKind | string | null;
  /** Deal value when the booking hangs off a deal — the authoritative number. */
  dealValue?: number | null;
  /** Lead estimate when there is no deal yet. */
  estimatedValue?: number | null;
}

/**
 * Rank a booking. A `job` is placed by its value; a job with no value at all
 * sits BELOW every valued job but still above a private booking — an unpriced
 * company job is not automatically the least important thing in the calendar.
 */
export function bookingRank(input: BookingPriorityInput): number {
  const { kind } = input;
  if (kind === "multi_unit_demo") return BOOKING_RANK.MULTI_UNIT_DEMO;
  if (kind === "single_machine_demo") return BOOKING_RANK.SINGLE_MACHINE_DEMO;
  if (kind === "private") return BOOKING_RANK.PRIVATE;
  if (kind === "job") {
    const value = input.dealValue ?? input.estimatedValue ?? null;
    if (value === null) return BOOKING_RANK.JOB_LOW;
    if (value >= JOB_VALUE_HIGH) return BOOKING_RANK.JOB_HIGH;
    if (value >= JOB_VALUE_MID) return BOOKING_RANK.JOB_MID;
    return BOOKING_RANK.JOB_LOW;
  }
  // An old task with no booking_kind, or a value we do not recognise: it sorts
  // last, and it is never the one flagged as bumpable (see conflicts.ts).
  return BOOKING_RANK.UNKNOWN;
}

/** True when `a` outranks `b` — strictly, so equal ranks never bump each other. */
export function outranks(a: BookingPriorityInput, b: BookingPriorityInput): boolean {
  return bookingRank(a) < bookingRank(b);
}
