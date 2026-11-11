import type { DriveBand, Place } from "./travel";

/**
 * Shared types of the route-aware booking logic (W8b slice 1). Pure data, no
 * functions: feasibility.ts, bundles.ts and route-slots.ts implement against
 * these, the service and the /api/booking routes serialise them.
 */

/** One machine with its own timeline (Áron 2026-11-10: multi-machine from day one). */
export interface Machine {
  id: number;
  name: string;
  /** Where the machine sleeps; the day starts and ends here. */
  base: Place;
}

/** An existing on-site booking on a machine's timeline. */
export interface RouteStop {
  /** tasks.id */
  id: number;
  machineId: number;
  startsAt: Date;
  /** Resolved visit length, always > 0. */
  minutes: number;
  /** Job site; null = unknown, travel falls back to the flat gap. */
  place: Place | null;
  title?: string;
  kind?: string | null;
  leadId?: number | null;
}

/** The booking being placed. `id` set = moving an existing task: it is left out of the timeline. */
export interface Candidate {
  id?: number;
  machineId: number;
  startsAt: Date;
  minutes: number;
  place: Place | null;
}

export type FlagCode =
  /** Cannot physically get there (or back) in time. Blocks. */
  | "infeasible"
  /** Overlaps another booking on the same machine. Blocks. */
  | "machine_clash"
  /** Starts before the visit window opens or ends after it closes. Blocks. */
  | "outside_window"
  /** The machine already has maxVisitsPerDay stops that day. Blocks. */
  | "day_full"
  /** Possible, but inside the band or under tightSlackMinutes of slack. Warns. */
  | "tight"
  /** Home after homeBy or more driving than longDayDriveMinutes. Warns (a night may be suggested later). */
  | "long_day"
  /** This booking or its neighbour has no site: travel not checked, flat gap used. Warns. */
  | "no_site"
  /** Site taken from the company address, confirm it on the call. Warns (added by the service). */
  | "site_assumed";

export type Leg = "before" | "after" | "from_base" | "to_base";

export interface Flag {
  code: FlagCode;
  severity: "block" | "warn";
  leg?: Leg;
  /** The neighbouring stop the flag is about (tasks.id). */
  againstId?: number;
  drive?: DriveBand;
  /** Minutes actually available on that leg (end of previous to start of next). */
  gapMinutes?: number;
  /** gap minus (slow drive + buffer); negative = short by that much. */
  slackMinutes?: number;
  /** For `infeasible`/`machine_clash` on the before leg: earliest start that would pass that leg. */
  earliestStart?: Date;
  /** For the after leg: latest start that would still reach the next stop. */
  latestStart?: Date;
}

export interface LegInfo {
  /** null = the machine's base. */
  stop: RouteStop | null;
  /** null = no place on one side, flat gap used. */
  drive: DriveBand | null;
  /** Minutes between end of the earlier and start of the later (for base legs: null). */
  gapMinutes: number | null;
}

export interface PlacementResult {
  machineId: number;
  startsAt: Date;
  endsAt: Date;
  /** True when no flag has severity "block". */
  feasible: boolean;
  flags: Flag[];
  before: LegInfo;
  after: LegInfo;
  /** The machine's other stops that day, start ascending (candidate excluded). */
  dayStops: RouteStop[];
  /** Leave base (start of first stop minus slow drive) and home (end of last stop plus slow drive) with the candidate in the day. */
  leaveBaseAt: Date | null;
  homeAt: Date | null;
  /** Mid-band driving of the whole day with the candidate. */
  dayDriveMinutes: number;
  /** Mid-band driving with the candidate minus without it. */
  addedDriveMinutes: number;
}

export type BundleTier = "same_city" | "near" | "in_area";

export interface BundleHint {
  stop: RouteStop;
  sameDay: boolean;
  /** Mid-band drive minutes between the two sites. */
  driveMinutes: number;
  tier: BundleTier;
  /** Working days between the two days (0 = same day). */
  workingDaysApart: number;
  /** Other-day hints: the best feasible start on THAT day, so the UI can offer "use that slot". */
  suggestedStart?: Date | null;
  suggestedMachineId?: number | null;
}

export type SlotReason = "same_trip" | "on_the_way" | "earliest" | "free_day" | "next_free";

export interface RankedSlot extends PlacementResult {
  /** Lower is better, in minutes-equivalent (plan 2.8). */
  cost: number;
  reason: SlotReason;
  bundles: BundleHint[];
}
