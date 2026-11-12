// Pure send gates of the scheduler, ported from the n8n/campaign.py sender (daily_cap, bounce stop,
// send window). No db here: scheduled-send.ts loads the numbers and asks.

import { localDay, localMinuteOfDay } from "@/lib/booking/time";

export const WARMUP_START_PER_DAY = 10;
export const WARMUP_STEP_PER_DAY = 2;
export const WARMUP_MAX_PER_DAY = 35;
export const BOUNCE_STOP_RATE = 0.03;
export const INBOX_FRESH_MS = 60 * 60_000;
/** Mon-Fri 08:30 (inclusive) to 16:30 (exclusive), Europe/Budapest. */
export const SEND_WINDOW = { days: [1, 2, 3, 4, 5], fromMinute: 8 * 60 + 30, toMinute: 16 * 60 + 30 } as const;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Per-sender cap for a Budapest day. The ramp moves by sending days, so a quiet week does not jump it. */
export function warmupCap(startedOn: string | null, todayKey: string, priorSendingDays: number): number {
  if (!startedOn || !YMD.test(startedOn) || todayKey < startedOn) return 0;
  return Math.min(WARMUP_MAX_PER_DAY, WARMUP_START_PER_DAY + WARMUP_STEP_PER_DAY * priorSendingDays);
}

export function bounceStopped(sent: number, bounced: number): boolean {
  return sent > 0 && bounced / sent >= BOUNCE_STOP_RATE;
}

/** The reply intake stamps tenants.settings.inboxCheckedAt; a stale or future stamp is not a check. */
export function inboxFresh(checkedAtIso: string | null, now: Date): boolean {
  const t = checkedAtIso ? Date.parse(checkedAtIso) : NaN;
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= INBOX_FRESH_MS && t - now.getTime() <= 5 * 60_000;
}

export function inSendWindow(now: Date): boolean {
  const m = localMinuteOfDay(now);
  return (SEND_WINDOW.days as readonly number[]).includes(localDay(now).dow) && m >= SEND_WINDOW.fromMinute && m < SEND_WINDOW.toMinute;
}
