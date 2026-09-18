import { z } from "zod";
import { CALL_OUTCOMES, type CallOutcomeKey } from "@/lib/leads/outcomes";
import { answersRecordSchema } from "@/lib/leads/qualification";

// Auto-outcome from a call transcript — PURE module (no DB, no network).
//
// The parse does NOT happen here and does not happen in the CRM at all: the
// call-outcome skill runs on the Claude subscription (same pattern as
// content-revise) and POSTs its reading back. This module is the CRM's half of
// that contract: validate what arrives, and decide whether it may be applied.
//
// Trust ladder (docs: 2026-09-17 framework, §3 + §6):
//   - facts stay read-only — the transcript is stored verbatim either way;
//   - a human act stays at the boundary — anything that BOOKS or CLOSES is
//     never auto-applied, whatever the confidence (see AUTO_APPLIABLE below);
//   - the parse records its own confidence, stored with the interaction, so
//     the agreement rate between parsed and corrected outcomes is measurable.

const CALL_OUTCOME_KEYS = CALL_OUTCOMES.map((o) => o.key) as [CallOutcomeKey, ...CallOutcomeKey[]];

/**
 * Below this, NOTHING is applied: the result lands as a "confirm outcome" task
 * with the suggestion attached.
 *
 * 0.8 is deliberately the same bar Kai's 2026-09-12 backlog note named, and it
 * is safe to sit here rather than higher because the only outcomes that can be
 * auto-applied at all are the reversible ones. Move it in ONE place, and only
 * once the agreement rate (parsed vs corrected) says which way.
 */
export const AUTO_OUTCOME_THRESHOLD = 0.8;

/**
 * The only outcomes a parse may apply on its own.
 *
 * Excluded on purpose, at any confidence:
 *   - `meeting_booked` — it writes a slot into a demo host's calendar. Booking
 *     is the human act the trust ladder keeps at the boundary.
 *   - `not_interested` / `disqualified` — they close the lead as lost, and a
 *     closed lead refuses further logging, so a wrong parse would need a human
 *     to re-open it before it could be corrected. One click to correct only
 *     stays one click while the lead is still open.
 *
 * What is left is reversible by logging the next call: a stage advance, a
 * no-op, and an internal callback task.
 */
export const AUTO_APPLIABLE: readonly CallOutcomeKey[] = ["no_answer", "wrong_number", "callback_requested"];

/** What the skill posts back. snake_case on the wire, like the other ingestion routes. */
export const parsedCallSchema = z.object({
  outcome: z.enum(CALL_OUTCOME_KEYS),
  /** The parse's own 0..1 judgement. Required — an unscored parse is never applied. */
  confidence: z.number().min(0).max(1),
  /** The note that becomes Interaction.notes. Every outcome requires one (callOutcomeSchema). */
  note: z.string().trim().min(1).max(8000),
  /** Qualification answers the transcript happened to contain, slug → answer. */
  answers: answersRecordSchema.optional(),
  /** ISO datetime — only meaningful for callback_requested. */
  callback_at: z.string().datetime().optional(),
  /** Read for the suggestion only: these outcomes are never auto-applied. */
  demo_with: z.enum(["aron", "peter"]).optional(),
  booking_at: z.string().datetime().optional(),
  lost_reason: z.string().trim().max(500).optional(),
});
export type ParsedCall = z.infer<typeof parsedCallSchema>;

export type AutoOutcomeDecision =
  | { apply: true; reason: null }
  | { apply: false; reason: "low_confidence" | "human_act" | "incomplete" };

/**
 * May this parse be applied without a human? Pure, so the same answer is given
 * by the route, the tests and anything that reports on it later.
 *
 * `now` is only used to reject a callback date in the past — a parse that reads
 * "hívjon vissza kedden" from a week-old transcript must not book a due date
 * that is already overdue the moment it is written.
 */
export function decideAutoOutcome(parsed: ParsedCall, now: Date = new Date()): AutoOutcomeDecision {
  if (!AUTO_APPLIABLE.includes(parsed.outcome)) return { apply: false, reason: "human_act" };
  if (parsed.confidence < AUTO_OUTCOME_THRESHOLD) return { apply: false, reason: "low_confidence" };
  if (parsed.outcome === "callback_requested") {
    if (!parsed.callback_at) return { apply: false, reason: "incomplete" };
    if (new Date(parsed.callback_at).getTime() < now.getTime()) return { apply: false, reason: "incomplete" };
  }
  return { apply: true, reason: null };
}

/** An interaction whose OUTCOME was machine-derived (not merely a stored transcript). */
export function isAutoOutcome(i: { outcome: string | null; autoConfidence: number | null }): boolean {
  return i.autoConfidence != null && i.outcome != null && i.outcome !== "transcribed";
}

/** The `callOutcomeSchema` shape, from a parse that decideAutoOutcome cleared. */
export function toCallOutcome(parsed: ParsedCall): Record<string, unknown> {
  return {
    outcome: parsed.outcome,
    note: parsed.note,
    ...(parsed.callback_at ? { callbackAt: parsed.callback_at } : {}),
  };
}

// ⚠️ HU strings below are PROPOSALS — unreviewed by Áron.
export const AUTO_OUTCOME_LABELS = {
  /** Badge on an interaction whose outcome the parse applied. */
  autoBadge: "Gépi kimenetel",
  /** Tooltip / subtitle under the badge; `{pct}` = confidence in percent. */
  autoBadgeHint: "Átiratból, {pct}%-os magabiztossággal. Egy kattintás javítani.",
  correct: "Javítás",
  /** Title of the task created when the parse is not applied. */
  confirmTaskTitle: "Kimenetel megerősítése",
  /** Reasons, rendered in the task body. */
  reasonLowConfidence: "A gépi olvasat bizonytalan",
  reasonHumanAct: "Ez a kimenetel emberi döntés (foglalás vagy lezárás)",
  reasonIncomplete: "A gépi olvasatból hiányzik a visszahívás időpontja",
  /** /drive: the dictate-and-submit button + its states. */
  analyze: "Átirat mentése",
  analyzeHint: "Diktáld be a hívást, a kimenetelt utána olvassuk ki belőle.",
  analyzeQueued: "Átirat mentve, elemzés folyamatban.",
  suggestion: "Gépi javaslat",
} as const;

export const AUTO_OUTCOME_REASON_LABEL: Record<Exclude<AutoOutcomeDecision["reason"], null>, string> = {
  low_confidence: AUTO_OUTCOME_LABELS.reasonLowConfidence,
  human_act: AUTO_OUTCOME_LABELS.reasonHumanAct,
  incomplete: AUTO_OUTCOME_LABELS.reasonIncomplete,
};
