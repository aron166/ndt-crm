/**
 * Wall-clock helpers for Europe/Budapest (W8b). The server runs in UTC on
 * Vercel, so `setHours` would put a 07:00 visit window at 08:00 or 09:00 local.
 * Every day bound in the route logic goes through these two functions instead.
 *
 * PURE module.
 */

export const BOOKING_TZ = "Europe/Budapest";

export interface LocalDay {
  /** "YYYY-MM-DD", the key bookings are grouped by. */
  key: string;
  y: number;
  m: number; // 1-12
  d: number;
  /** 0 = Sunday ... 6 = Saturday. */
  dow: number;
}

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BOOKING_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function parts(date: Date) {
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(date)) p[x.type] = x.value;
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    minute: Number(p.hour) * 60 + Number(p.minute),
    dow: DOW[p.weekday],
  };
}

/** The Budapest calendar day a moment falls on. */
export function localDay(date: Date): LocalDay {
  const { y, m, d, dow } = parts(date);
  const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { key, y, m, d, dow };
}

/** Minutes since local midnight (0-1439). */
export function localMinuteOfDay(date: Date): number {
  return parts(date).minute;
}

/**
 * The instant at `minuteOfDay` local time on day (y, m, d). Two passes so a
 * DST switch between midnight and the target minute is handled.
 */
export function atLocal(day: Pick<LocalDay, "y" | "m" | "d">, minuteOfDay: number): Date {
  const wall = Date.UTC(day.y, day.m - 1, day.d, 0, 0) + minuteOfDay * 60_000;
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(guess));
    const seen = Date.UTC(p.y, p.m - 1, p.d, 0, 0) + p.minute * 60_000;
    guess += wall - seen;
  }
  return new Date(guess);
}

/** The local day `n` calendar days after `day` (n may be negative). */
export function addDays(day: LocalDay, n: number): LocalDay {
  // Noon avoids any DST edge when stepping whole days.
  return localDay(atLocal(day, 12 * 60 + n * 24 * 60));
}

export function isWorkingDay(day: LocalDay): boolean {
  // shortcut: Mon-Fri only, no Hungarian public holidays; add a holiday list when a booking lands on one.
  return day.dow >= 1 && day.dow <= 5;
}

/** Working days strictly after `from` up to and including `to` (0 when to <= from). */
export function workingDaysBetween(from: LocalDay, to: LocalDay): number {
  if (to.key <= from.key) return 0;
  let n = 0;
  for (let d = addDays(from, 1); d.key <= to.key; d = addDays(d, 1)) if (isWorkingDay(d)) n++;
  return n;
}

/** The working day `n` working days after `from` (n >= 0; n = 0 is `from` itself or the next working day). */
export function addWorkingDays(from: LocalDay, n: number): LocalDay {
  let d = from;
  while (!isWorkingDay(d)) d = addDays(d, 1);
  for (let i = 0; i < n; ) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) i++;
  }
  return d;
}
