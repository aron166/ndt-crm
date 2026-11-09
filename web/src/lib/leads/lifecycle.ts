// W2 lead lifecycle (docs: workspace docs/birdsview/gtm-system-2026-11-08/W2-lifecycle-spec.md).
// PURE module, no DB: stage keys, the allowed-transition table (the default seed;
// a tenant's live table is lead_status_transitions), cadence, SLA, recall
// defaults, stage-entry tasks, max-age and the daily digest. The DB side is
// lib/leads/service.ts (changeLeadStatus) and lib/leads/lifecycle-sweep.ts.
//
// Automations here PLAN TASKS ONLY. Nothing in this file or its callers sends an
// email, SMS or message to a lead: "email"/"sms" below are task types a human
// (or a later lane) acts on.

export const MAIN_STAGES = [
  "new", "contacting", "discovery_booked", "qualified", "offer_sent",
  "demo_booked", "demo_done", "ordered", "won",
] as const;
export const SIDE_STAGES = ["recall", "lost"] as const;
export type LeadStage = (typeof MAIN_STAGES)[number] | (typeof SIDE_STAGES)[number];
export const ALL_STAGES: readonly string[] = [...MAIN_STAGES, ...SIDE_STAGES];
/** Closed stages: no owner / next action needed, never swept. */
export const CLOSED_STAGES: readonly string[] = ["won", "lost"];
export const isOpenStage = (s: string | null) => s != null && !CLOSED_STAGES.includes(s);

export const MAX_ATTEMPTS = 8;

export const LOST_REASONS = [
  "invalid_contact", "not_our_service", "no_need", "did_in_house", "chose_competitor",
  "price", "project_cancelled", "bought_machine_elsewhere", "unreachable", "other",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];
export const isLostReason = (s: unknown): s is LostReason => (LOST_REASONS as readonly unknown[]).includes(s);
/** These codes need a note (spec 7: competitor name, or what "other" was). */
export const LOST_REASONS_NEEDING_NOTE: readonly LostReason[] = ["other", "chose_competitor"];

export const RECALL_REASONS = ["timing", "budget_cycle", "no_decision", "unreachable", "no_show"] as const;
export type RecallReason = (typeof RECALL_REASONS)[number];
export const isRecallReason = (s: unknown): s is RecallReason => (RECALL_REASONS as readonly unknown[]).includes(s);

export const BUYER_TYPES = ["company", "private"] as const;
export const INTENTS = ["service_concrete", "service_vague", "rental", "purchase", "unknown"] as const;
export const OFFER_TYPES = ["service", "rental", "purchase"] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

export const DEMO_CREDIT_DAYS = 30;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ── Transition table (spec section 4) ───────────────────────────────

export interface LeadTransition {
  from: string;
  event: string;
  to: string;
  /** What the move creates, human-readable (the spec's "Action created" column). */
  action: string | null;
}

const OPEN_FOR_INBOUND = ["new", "discovery_booked", "qualified", "offer_sent", "demo_booked", "demo_done", "ordered", "recall"];
// The first call from `new` has the same outcomes as a call while contacting.
const CALL_ROWS = (from: string): LeadTransition[] => [
  { from, event: "call_no_answer", to: "contacting", action: "next call per cadence" },
  { from, event: "call_meeting_booked", to: "discovery_booked", action: "calendar event + recap" },
  { from, event: "call_qualified", to: "qualified", action: "set offer_type" },
  { from, event: "call_not_now", to: "recall", action: "recall_date = their date" },
  { from, event: "call_no_fit", to: "lost", action: "lost_reason" },
  { from, event: "call_wrong_number", to: "lost", action: "lost_reason invalid_contact" },
];

/** The default seed. The SQL seed for tenant 1 is generated from this list. */
export const DEFAULT_TRANSITIONS: LeadTransition[] = [
  ...CALL_ROWS("new"),
  { from: "new", event: "sla_missed", to: "new", action: "escalation task to Áron" },
  ...CALL_ROWS("contacting"),
  { from: "contacting", event: "attempts_exhausted", to: "recall", action: "closing email task, recall unreachable 60 d" },
  { from: "discovery_booked", event: "meeting_no_show", to: "discovery_booked", action: "call + email, rebook (max 2)" },
  { from: "discovery_booked", event: "meeting_no_show_twice", to: "recall", action: "closing email task, recall no_show" },
  { from: "discovery_booked", event: "meeting_done_fit", to: "qualified", action: "set offer_type, notes" },
  { from: "discovery_booked", event: "meeting_done_no_fit", to: "lost", action: "lost_reason" },
  { from: "qualified", event: "offer_sent", to: "offer_sent", action: "follow-up call tasks day 2, 5, 10" },
  { from: "offer_sent", event: "demo_booked", to: "demo_booked", action: "calendar event, payment terms" },
  { from: "offer_sent", event: "call_meeting_booked", to: "demo_booked", action: "calendar event, payment terms" },
  { from: "offer_sent", event: "offer_accepted", to: "ordered", action: "deposit/invoice, payment check task" },
  { from: "offer_sent", event: "offer_silent", to: "offer_sent", action: "follow-up call" },
  { from: "offer_sent", event: "offer_expired", to: "recall", action: "closing email task, recall no_decision" },
  { from: "offer_sent", event: "offer_declined", to: "lost", action: "lost_reason" },
  { from: "demo_booked", event: "demo_delivered", to: "demo_done", action: "report + decision call task, demo credit clock" },
  { from: "demo_booked", event: "demo_cancelled", to: "recall", action: "ask reason" },
  { from: "demo_booked", event: "demo_declined", to: "lost", action: "lost_reason" },
  { from: "demo_done", event: "order_placed", to: "ordered", action: "credit applied if within 30 days, payment check task" },
  { from: "demo_done", event: "demo_followed_up", to: "demo_done", action: "follow-up day 3, 7, 14" },
  { from: "demo_done", event: "demo_expired", to: "recall", action: "closing email task, recall no_decision" },
  { from: "ordered", event: "order_won", to: "won", action: "handover task" },
  { from: "ordered", event: "payment_reminded", to: "ordered", action: "payment reminder call; day 15 escalate to Áron" },
  { from: "recall", event: "recall_date_reached", to: "contacting", action: "review note, one personal touch" },
  { from: "recall", event: "recall_unreachable_twice", to: "lost", action: "none" },
  ...OPEN_FOR_INBOUND.map((from) => ({ from, event: "inbound_received", to: "contacting", action: "call task, nurture paused" })),
  { from: "contacting", event: "inbound_received", to: "contacting", action: "call task, nurture paused" },
  { from: "lost", event: "inbound_received", to: "new", action: "history shown" },
];

export function findTransition(table: readonly LeadTransition[], from: string, event: string): LeadTransition | null {
  return table.find((t) => t.from === from && t.event === event) ?? null;
}

/** Every event that moves `from` to `to` (a board drag picks the first). */
export function transitionsBetween(table: readonly LeadTransition[], from: string, to: string): LeadTransition[] {
  return table.filter((t) => t.from === from && t.to === to);
}

// ── Budapest wall clock ─────────────────────────────────────────────

const TZ = "Europe/Budapest";

function budapestParts(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    h: Number(p.hour), min: Number(p.minute),
    dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
  };
}

/** The UTC instant of a Budapest wall-clock time (DST-correct via the offset at that day). */
export function atBudapest(y: number, m: number, d: number, h: number, min = 0): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const p = budapestParts(new Date(guess));
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - guess;
  return new Date(guess - offset);
}

const isWorkday = (dow: number) => dow >= 1 && dow <= 5;

/** Next working day (Mon-Fri) at h:min Budapest, strictly after `from`'s calendar day. */
function nextWorkdayAt(from: Date, h: number, min: number): Date {
  // shortcut: Hungarian public holidays are ignored; add a holiday list when the first one bites.
  let t = new Date(from.getTime());
  for (let i = 0; i < 8; i++) {
    t = new Date(t.getTime() + DAY);
    const p = budapestParts(t);
    if (isWorkday(p.dow)) return atBudapest(p.y, p.m, p.d, h, min);
  }
  return t;
}

/**
 * First-call SLA (spec 4, row 1): 1 working hour inside Mon-Fri 8-17 Budapest;
 * outside hours (or too late to fit the hour) the next working morning 9:30.
 */
export function slaDeadline(createdAt: Date): Date {
  const p = budapestParts(createdAt);
  if (isWorkday(p.dow) && p.h >= 8 && p.h < 16) return new Date(createdAt.getTime() + HOUR);
  if (isWorkday(p.dow) && p.h < 8) return atBudapest(p.y, p.m, p.d, 9, 30);
  return nextWorkdayAt(createdAt, 9, 30);
}

/** `n` working days after `from`, same clock time (used for "1 working day" SLAs). */
export function addWorkdays(from: Date, n: number): Date {
  let t = from;
  for (let i = 0; i < n; i++) {
    const p = budapestParts(t);
    const next = nextWorkdayAt(t, p.h, p.min);
    t = next;
  }
  return t;
}

// ── Attempt cadence (spec 5) ────────────────────────────────────────

export interface CadenceStep {
  attempt: number;
  /** Offset from day 0 = when the lead entered `contacting` (the first attempt). */
  offsetMs: number;
  type: "call" | "email";
  /** PROPOSAL copy (Hungarian, pending Áron). */
  title: string;
}

export const CADENCE: CadenceStep[] = [
  { attempt: 1, offsetMs: 0, type: "call", title: "1. hívás" },
  { attempt: 2, offsetMs: 3.5 * HOUR, type: "call", title: "2. hívás" },
  { attempt: 3, offsetMs: 2 * DAY, type: "call", title: "3. hívás" },
  { attempt: 4, offsetMs: 4 * DAY, type: "call", title: "4. hívás + rövid email példa szkennel" },
  { attempt: 5, offsetMs: 7 * DAY, type: "call", title: "5. hívás" },
  { attempt: 6, offsetMs: 9 * DAY, type: "call", title: "6. hívás + SMS" },
  { attempt: 7, offsetMs: 12 * DAY, type: "call", title: "7. hívás, más napszakban" },
  { attempt: 8, offsetMs: 14 * DAY, type: "email", title: "Záró email: válaszoljon, ha újranyitná" },
];

/** The cadence step for attempt `n` (1..8), due at day0 + offset, never in the past. */
export function cadenceTask(n: number, day0: Date, now: Date): { title: string; type: "call" | "email"; dueDate: Date } | null {
  const step = CADENCE.find((c) => c.attempt === n);
  if (!step) return null;
  const due = new Date(Math.max(day0.getTime() + step.offsetMs, now.getTime()));
  return { title: step.title, type: step.type, dueDate: due };
}

// ── Recall defaults (spec 6) ────────────────────────────────────────

export function recallDefaultDate(reason: RecallReason, now: Date): Date {
  switch (reason) {
    case "timing": return new Date(now.getTime() + 90 * DAY);
    case "budget_cycle": {
      const p = budapestParts(now);
      return atBudapest(p.y + 1, 1, 6, 9, 0); // first working week of January
    }
    case "no_decision": return new Date(now.getTime() + 60 * DAY);
    case "unreachable": return new Date(now.getTime() + 60 * DAY);
    case "no_show": return new Date(now.getTime() + 30 * DAY);
  }
}

// Which recall reason a move into recall carries when the caller gives none.
export const RECALL_REASON_BY_EVENT: Record<string, RecallReason> = {
  attempts_exhausted: "unreachable",
  call_not_now: "timing",
  meeting_no_show_twice: "no_show",
  offer_expired: "no_decision",
  demo_expired: "no_decision",
  demo_cancelled: "timing",
};
// Which lost reason a move into lost carries when the caller gives none.
export const LOST_REASON_BY_EVENT: Record<string, LostReason> = {
  call_wrong_number: "invalid_contact",
  recall_unreachable_twice: "unreachable",
};

// ── Tasks a stage entry creates (spec 4 "Action created", tasks only) ──

export interface PlannedTask {
  title: string;
  type: "call" | "email" | "meeting" | "internal";
  dueDate: Date;
  /** Assign to the escalation user (Áron) instead of the owner. */
  escalate?: boolean;
}

/**
 * Tasks created when a lead ENTERS `to` via `event` (not on self-transitions,
 * those are planned by their own event). The first one becomes the lead's
 * next_action / next_due when the caller gave none.
 */
export function entryTasks(to: string, event: string, now: Date, ctx: { recallDate?: Date | null } = {}): PlannedTask[] {
  switch (to) {
    case "contacting":
      if (event === "recall_date_reached") {
        return [{ title: "Visszahívás esedékes: átnézés + egy személyes megkeresés", type: "call", dueDate: now }];
      }
      if (event === "inbound_received") return [{ title: "Bejövő válasz: hívd vissza", type: "call", dueDate: new Date(now.getTime() + HOUR) }];
      return [];
    case "qualified":
      return [{ title: "Ajánlat összeállítása és kiküldése", type: "internal", dueDate: addWorkdays(now, 1) }];
    case "offer_sent":
      return [2, 5, 10].map((d) => ({ title: `Ajánlat utánkövetés (${d}. nap)`, type: "call" as const, dueDate: new Date(now.getTime() + d * DAY) }));
    case "demo_done":
      return [
        { title: "Demó riport kiküldése + döntési hívás", type: "call", dueDate: addWorkdays(now, 2) },
        { title: "Demó utánkövetés (3. nap)", type: "call", dueDate: new Date(now.getTime() + 3 * DAY) },
        { title: "Demó utánkövetés (7. nap): jóváírás határideje", type: "call", dueDate: new Date(now.getTime() + 7 * DAY) },
        { title: "Demó utánkövetés (14. nap)", type: "call", dueDate: new Date(now.getTime() + 14 * DAY) },
        { title: "Demó jóváírás ma lejár", type: "internal", dueDate: new Date(now.getTime() + DEMO_CREDIT_DAYS * DAY) },
      ];
    case "ordered":
      return [
        { title: "Előleg / számla kiküldve, fizetés ellenőrzése", type: "internal", dueDate: new Date(now.getTime() + 8 * DAY) },
        { title: "Fizetés nem érkezett: eszkaláció", type: "internal", dueDate: new Date(now.getTime() + 15 * DAY), escalate: true },
      ];
    case "won":
      return [{ title: "Átadás: munka dátuma / bérlés rögzítése / gép kiszállítása", type: "internal", dueDate: addWorkdays(now, 1) }];
    case "recall":
      return ctx.recallDate ? [{ title: "Visszahívás", type: "call", dueDate: ctx.recallDate }] : [];
    default:
      // discovery_booked / demo_booked: the dated meeting IS the next action (caller supplies it).
      return [];
  }
}

// ── Max age per stage (spec 2) and the 08:00 digest ─────────────────

export interface DigestLead {
  id: number;
  name: string;
  status: string | null;
  ownerName: string | null;
  attempts: number;
  nextAction: string | null;
  nextDue: Date | null;
  statusEnteredAt: Date | null;
  recallDate: Date | null;
}

/** The moment a lead in its stage is past the spec's max age, or null (no limit / closed). */
export function maxAgeDeadline(lead: Pick<DigestLead, "status" | "statusEnteredAt" | "nextDue" | "recallDate">): Date | null {
  const t = lead.statusEnteredAt;
  switch (lead.status) {
    case "new": return t ? slaDeadline(t) : null;
    case "contacting": return t ? new Date(t.getTime() + 14 * DAY) : null;
    case "discovery_booked": return lead.nextDue ? new Date(lead.nextDue.getTime() + DAY) : null;
    case "qualified": return t ? addWorkdays(t, 1) : null;
    case "offer_sent": return t ? new Date(t.getTime() + 10 * DAY) : null;
    case "demo_booked": return lead.nextDue;
    case "demo_done": return t ? new Date(t.getTime() + 14 * DAY) : null;
    case "ordered": return t ? new Date(t.getTime() + 8 * DAY) : null;
    case "recall": return lead.recallDate;
    default: return null;
  }
}

export interface Digest {
  dueToday: DigestLead[];
  overdue: DigestLead[];
  pastMaxAge: DigestLead[];
  noNextAction: DigestLead[];
  text: string;
}

/** End of `now`'s Budapest calendar day. */
function endOfBudapestDay(now: Date): Date {
  const p = budapestParts(now);
  return new Date(atBudapest(p.y, p.m, p.d, 0, 0).getTime() + DAY);
}

/** Pure: the 08:00 sweep content (spec 4, last line). Closed leads are ignored. */
export function buildDigest(leads: DigestLead[], now: Date): Digest {
  const open = leads.filter((l) => isOpenStage(l.status));
  const eod = endOfBudapestDay(now).getTime();
  const overdue = open.filter((l) => l.nextDue && l.nextDue.getTime() < now.getTime());
  const dueToday = open.filter((l) => l.nextDue && l.nextDue.getTime() >= now.getTime() && l.nextDue.getTime() < eod);
  const pastMaxAge = open.filter((l) => {
    const d = maxAgeDeadline(l);
    return d != null && d.getTime() < now.getTime();
  });
  const noNextAction = open.filter((l) => !l.nextAction || !l.nextDue || !l.ownerName);
  const line = (l: DigestLead) =>
    `- #${l.id} ${l.name} [${l.status}${l.attempts ? `, ${l.attempts}. próbálkozás` : ""}]` +
    `${l.nextAction ? `: ${l.nextAction}` : ""}${l.ownerName ? ` (${l.ownerName})` : ""}`;
  const section = (title: string, xs: DigestLead[]) => (xs.length ? [`${title} (${xs.length})`, ...xs.map(line)] : []);
  const text = [
    ...section("Ma esedékes", dueToday),
    ...section("Lejárt", overdue),
    ...section("Túl régóta egy fázisban", pastMaxAge),
    ...section("Nincs következő lépés", noNextAction),
  ].join("\n") || "Nincs teendő.";
  return { dueToday, overdue, pastMaxAge, noNextAction, text };
}
