// Lead and call vocabulary. IMPORT-FREE on purpose (like lib/outreach/steps.ts):
// client components, pure modules and automation code all share these strings.

export const LEAD_OUTCOMES = ["open", "won", "lost"] as const;
export type LeadOutcome = (typeof LEAD_OUTCOMES)[number];
export const LEAD_OUTCOME_LABEL: Record<LeadOutcome, string> = {
  open: "Nyitott",
  won: "Nyert",
  lost: "Vesztett",
};

export const CALL_OUTCOMES = [
  { key: "no_answer",          label: "Nem vette fel" },
  { key: "wrong_number",       label: "Rossz szám" },
  { key: "not_interested",     label: "Nem érdekli" },
  { key: "disqualified",       label: "Diszkvalifikált" },
  { key: "callback_requested", label: "Visszahívást kért" },
  { key: "meeting_booked",     label: "Foglalt meeting" },
] as const;
export type CallOutcomeKey = (typeof CALL_OUTCOMES)[number]["key"];
/**
 * The call outcomes that CLOSE the lead as lost. Péter's rule (BRIEFING addendum
 * 2026-09-07): "mandatory note on every outcome, INCLUDING a reason for
 * lost/disqualified", the outcome key on its own is not a reason, so these two
 * additionally require a short free-text `lostReason`.
 */
export const LOST_CALL_OUTCOMES: readonly CallOutcomeKey[] = ["not_interested", "disqualified"];
export function isLostCallOutcome(key: string): boolean {
  return (LOST_CALL_OUTCOMES as readonly string[]).includes(key);
}
/**
 * Outcomes whose `.superRefine` rule above requires an extra field beyond the
 * note (callbackAt / demoWith / lostReason), the client uses this only to
 * decide which field to reveal; the schema above is what actually enforces it.
 */
export const CALL_OUTCOMES_NEEDING_DETAIL: readonly CallOutcomeKey[] = [
  "callback_requested",
  "meeting_booked",
  "not_interested",
  "disqualified",
];
/** Shortest reason we accept anywhere. "x" is not a reason. */
export const LOST_REASON_MIN = 3;
export const LOST_REASON_MAX = 500;
export const TECHNOLOGY_WORD_MAX = 120;

export function callOutcomeLabel(key: string | null): string {
  return CALL_OUTCOMES.find((o) => o.key === key)?.label ?? key ?? "-";
}

/** Who can host a demo. (Not the content `forWhom` type, which also has "either".) */
export const DEMO_HOSTS = ["aron", "peter"] as const;
export type DemoHost = (typeof DEMO_HOSTS)[number];

export const DEMO_STATUS: Record<DemoHost, string> = {
  aron: "demo_aron",
  peter: "demo_peter",
};

/** `no_answer` walks the lead along this chain (one step per attempt). */
export const CALL_STAGE_CHAIN = ["new", "call_1", "call_2", "call_3", "call_3_plus"] as const;
/** Stage a lead lands in when it asks for a callback. */
export const RECALL_STATUS = "recall";

/** The call outcome key that books a demo. */
export const MEETING_BOOKED_OUTCOME = "meeting_booked" satisfies CallOutcomeKey;

/** Interaction outcome marker for a call transcript awaiting (or after) a parse. */
export const TRANSCRIBED_OUTCOME = "transcribed";

/** The shape of a lead call task (callback, confirm, follow-up). Status is left to each site. */
export const LEAD_CALL_TASK = { type: "call", category: "revenue_generating" } as const;

/** A lead is active when it is open and not converted: the board / queue predicate. */
export const ACTIVE_LEAD_WHERE = { outcome: "open", convertedDealId: null } as const;
export function isLeadActive(lead: { outcome: string; convertedDealId?: number | null }): boolean {
  return lead.outcome === "open" && !lead.convertedDealId;
}
