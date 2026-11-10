import { addDays, atLocal, isWorkingDay, localDay, localMinuteOfDay, type LocalDay } from "@/lib/booking/time";
import type { CheckResultDto, DriveBandDto, FlagCode, PlacementDto, RouteStopDto, SlotReason } from "./booking-api";

/** PURE helpers of the booking panel: Budapest formatting, grid geometry, labels. */

const WEEKDAY = ["Vasárnap", "Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat"];
const WEEKDAY_SHORT = ["V", "H", "K", "Sze", "Cs", "P", "Szo"];
const MONTH = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];

const pad = (n: number) => String(n).padStart(2, "0");

export function fmtTime(iso: string): string {
  const m = localMinuteOfDay(new Date(iso));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "Szerda, nov. 18. 13:30" */
export function fmtDate(iso: string): string {
  const d = localDay(new Date(iso));
  return `${WEEKDAY[d.dow]}, ${MONTH[d.m - 1]} ${d.d}. ${fmtTime(iso)}`;
}

/** "szerda 13:30", for aria labels. */
export function fmtWeekdayTime(iso: string): string {
  return `${WEEKDAY[localDay(new Date(iso)).dow].toLowerCase()} ${fmtTime(iso)}`;
}

/** "Sze nov. 18." */
export function fmtRowLabel(day: LocalDay): string {
  return `${WEEKDAY_SHORT[day.dow]} ${MONTH[day.m - 1]} ${day.d}.`;
}

/** "1 ó 05 p", "45 p" */
export function fmtDuration(minutes: number): string {
  const t = Math.round(minutes);
  const h = Math.floor(t / 60);
  return h > 0 ? `${h} ó ${pad(t % 60)} p` : `${t} p`;
}

/** "1 ó 05 p - 1 ó 20 p" when min != max. */
export function fmtBand(b: DriveBandDto): string {
  return b.min === b.max ? fmtDuration(b.min) : `${fmtDuration(b.min)} - ${fmtDuration(b.max)}`;
}

export const GRID_START = 6 * 60;
export const GRID_END = 19 * 60;

/** Left and width in percent of the window, clamped to it. */
export function geometry(startMin: number, endMin: number, winStart = GRID_START, winEnd = GRID_END): { left: number; width: number } {
  const span = winEnd - winStart;
  const clamp = (v: number) => Math.min(100, Math.max(0, ((v - winStart) / span) * 100));
  const left = clamp(startMin);
  return { left, width: Math.max(0, clamp(endMin) - left) };
}

/** Working days from the result's `from` to the last slot day, at most `max`. */
export function gridRows(fromIso: string, slotStarts: string[], max = 10): LocalDay[] {
  const first = localDay(new Date(fromIso));
  const lastKey = slotStarts.map((s) => localDay(new Date(s)).key).sort().pop() ?? first.key;
  const out: LocalDay[] = [];
  let d = first;
  for (let i = 0; i < 120 && d.key <= lastKey && out.length < max; i++, d = addDays(d, 1)) {
    if (isWorkingDay(d)) out.push(d);
  }
  return out;
}

/** The instant of "HH:mm" Budapest wall time on a "YYYY-MM-DD" day, as an ISO string. */
export function budapestIso(dayKey: string, hhmm: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return atLocal({ y, m, d }, h * 60 + min).toISOString();
}

/** A datetime-local value ("2026-11-10T09:00") read as Budapest wall time. */
export function localInputToIso(value: string): string | null {
  const [day, time] = value.split("T");
  return day && time ? budapestIso(day, time.slice(0, 5)) : null;
}

export const dayKeyOf = (iso: string) => localDay(new Date(iso)).key;

export const REASON_LABEL: Record<SlotReason, string> = {
  same_trip: "Egy úton",
  on_the_way: "Útba esik",
  earliest: "Legkorábbi szabad",
  free_day: "Szabad nap",
  next_free: "Következő szabad",
};

export const FLAG_SENTENCE: Record<FlagCode, string> = {
  infeasible: "Nem érhető el időben",
  machine_clash: "Ütközik egy foglalással",
  outside_window: "Kívül esik a látogatási időn",
  day_full: "Betelt a nap",
  tight: "Szoros átállás",
  long_day: "Hosszú nap",
  no_site: "Hiányzó helyszín, az útidő nincs ellenőrizve",
  site_assumed: "Feltételezett helyszín, erősítsd meg",
};

export const stopLabel = (s: RouteStopDto) => s.title ?? s.place?.name ?? "Foglalás"; // PROPOSAL copy

export const blockSentences = (p: PlacementDto) => p.flags.filter((f) => f.severity === "block").map((f) => FLAG_SENTENCE[f.code]);
export const warnSentences = (p: PlacementDto) => p.flags.filter((f) => f.severity === "warn").map((f) => FLAG_SENTENCE[f.code]);

/** The machine a check is about: the best one, else the first. */
export const checkMachine = (c: CheckResultDto) => c.machines.find((m) => m.machineId === c.bestMachineId) ?? c.machines[0] ?? null;

export interface DayBlock {
  kind: "stop" | "cand" | "drive";
  start: number;
  end: number;
  label: string;
  tip: string;
}

const range = (a: number, b: number) => `${pad(Math.floor(a / 60))}:${pad(a % 60)}-${pad(Math.floor(b / 60) % 24)}:${pad(b % 60)}`;

/** Blocks of one machine day. With a candidate, dashed drive bars run base -> first block and last block -> home. */
export function dayBlocks(p: PlacementDto, withCandidate: boolean): DayBlock[] {
  const out: DayBlock[] = p.dayStops.map((s) => {
    const start = localMinuteOfDay(new Date(s.startsAt));
    const end = start + s.minutes;
    return { kind: "stop" as const, start, end, label: stopLabel(s), tip: `${stopLabel(s)}, ${range(start, end)}` };
  });
  if (!withCandidate) return out;
  const cs = localMinuteOfDay(new Date(p.startsAt));
  const ce = localMinuteOfDay(new Date(p.endsAt)) || cs + 1;
  out.push({ kind: "cand", start: cs, end: ce, label: "", tip: `Javaslat, ${range(cs, ce)}` });
  out.sort((a, b) => a.start - b.start);
  const first = out[0];
  const last = out.reduce((a, b) => (b.end > a.end ? b : a));
  const drives: DayBlock[] = [];
  if (p.leaveBaseAt) {
    const s = localMinuteOfDay(new Date(p.leaveBaseAt));
    if (s < first.start) drives.push({ kind: "drive", start: s, end: first.start, label: "", tip: `Vezetés, ${range(s, first.start)}` });
  }
  if (p.homeAt) {
    const e = localMinuteOfDay(new Date(p.homeAt));
    if (e > last.end) drives.push({ kind: "drive", start: last.end, end: e, label: "", tip: `Vezetés, ${range(last.end, e)}` });
  }
  return [...drives, ...out];
}
