import { z } from "zod";

/**
 * Route-aware booking settings (W8b plan sections 0 and 2). Defaults live here;
 * a tenant overrides any of them in `tenants.settings.booking`. All times are
 * minutes since local midnight (Europe/Budapest), all durations minutes.
 *
 * PURE module.
 */

const minuteOfDay = z.number().int().min(0).max(24 * 60);
const minutes = z.number().int().min(0).max(24 * 60);

export const bookingConfigSchema = z.object({
  /** Earliest the machine leaves base (A3). */
  leaveBaseFrom: minuteOfDay,
  /** Home by (A3). Later than this is `long_day` (a night is suggested), not impossible. */
  homeBy: minuteOfDay,
  /** Visit window on site (A3): a visit starts no earlier and ends no later. */
  visitFrom: minuteOfDay,
  visitTo: minuteOfDay,
  /** Added to every drive leg: parking, gate, walking the machine in (2.3). */
  siteBufferMinutes: minutes,
  /** Gap used when either side has no place: today's flat rule (conflicts.ts). */
  noSiteGapMinutes: minutes,
  /** Less slack than this over the slow end of the band is `tight` (2.7). */
  tightSlackMinutes: minutes,
  /** Visits per machine per day (A4). */
  maxVisitsPerDay: z.number().int().min(1).max(20),
  /** More driving than this in a day is `long_day` (2.4). */
  longDayDriveMinutes: minutes,
  /** Slot grid (2.8). */
  slotStepMinutes: z.number().int().min(5).max(120),
  /** "Near" tiers by drive minutes (2.6). */
  tierSameCity: minutes,
  tierNear: minutes,
  tierArea: minutes,
  /** Bundle search window either side of the chosen day, working days (2.7). */
  bundleWindowWorkingDays: z.number().int().min(0).max(30),
  /** Minutes on site per booking kind (2.3); unknown kinds use `defaultVisitMinutes`. */
  visitMinutesByKind: z.record(z.string(), minutes),
  defaultVisitMinutes: minutes,
  /** Earliest proposal per kind, working days from today (2.8). Proposals only; a hand-picked time may be sooner. */
  minLeadWorkingDaysByKind: z.record(z.string(), z.number().int().min(0).max(60)),
  /** Ranking weights (2.8). */
  weightWaitPerWorkingDay: z.number().min(0),
  weightIdlePerMinute: z.number().min(0),
  idleCapMinutes: minutes,
  weightLatePerMinute: z.number().min(0),
  /** Home after this costs `weightLatePerMinute` per minute (2.8: 18:00). */
  lateFrom: minuteOfDay,
});

export type BookingConfig = z.infer<typeof bookingConfigSchema>;

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  leaveBaseFrom: 6 * 60,
  homeBy: 19 * 60,
  visitFrom: 7 * 60,
  visitTo: 17 * 60,
  siteBufferMinutes: 15,
  noSiteGapMinutes: 30,
  tightSlackMinutes: 15,
  maxVisitsPerDay: 3,
  longDayDriveMinutes: 360,
  slotStepMinutes: 30,
  tierSameCity: 10,
  tierNear: 30,
  tierArea: 60,
  bundleWindowWorkingDays: 10,
  // `job` = paid demo or service visit; the plan assumes paid demos are booked as job (A, 2.3).
  visitMinutesByKind: { multi_unit_demo: 150, single_machine_demo: 120, job: 90, private: 90 },
  defaultVisitMinutes: 90,
  minLeadWorkingDaysByKind: { multi_unit_demo: 5, single_machine_demo: 5, job: 2, private: 1 },
  weightWaitPerWorkingDay: 20,
  weightIdlePerMinute: 0.25,
  idleCapMinutes: 120,
  weightLatePerMinute: 1,
  lateFrom: 18 * 60,
};

/** Defaults overlaid with whatever valid keys `tenants.settings.booking` carries. Invalid keys are ignored one by one. */
export function bookingConfigFromSettings(settings: unknown): BookingConfig {
  const raw = (settings as { booking?: unknown } | null)?.booking;
  if (!raw || typeof raw !== "object") return DEFAULT_BOOKING_CONFIG;
  const out: Record<string, unknown> = { ...DEFAULT_BOOKING_CONFIG };
  const shape = bookingConfigSchema.shape as Record<string, z.ZodType>;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(k in shape)) continue;
    const parsed = shape[k].safeParse(v);
    if (parsed.success) out[k] = parsed.data;
  }
  return out as BookingConfig;
}

export function visitMinutes(cfg: BookingConfig, kind: string | null | undefined): number {
  return (kind && cfg.visitMinutesByKind[kind]) || cfg.defaultVisitMinutes;
}
