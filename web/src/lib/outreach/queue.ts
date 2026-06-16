// Outreach cockpit ("Hívás mód") — pure logic, DB-free.
//
// The cockpit turns Péter's cold/warm call list into a guided session: one
// company at a time, one tap to log the call. Speed is the stated NDT moat
// (40% of contracts won purely on quoting speed — memory/ndt-domain.md), so the
// loop has to be friction-free. Each tap = an append-only Interaction + a
// pipeline-status transition + an optional follow-up task, all server-side.
//
// pipelineStatus is the 0–8 funnel migrated from Zoho (memory/ndt-domain.md):
//   0 KUKA · 1 Nem hívtuk · 2 NV (no answer) · 3 Érdeklődő · 4 Nem érdekelt
//   5 Kéri · 6 Folyamatban · 7 CL · 8 CW
// This module owns the outcome taxonomy + the rule that maps a call OUTCOME onto
// the next status, so the transition can't drift across the UI and the action.

/** Statuses we proactively call. Excludes KUKA(0), Nem érdekelt(4), CL(7), CW(8). */
export const CALLABLE_STATUSES = ["1", "2", "3", "5", "6"] as const;

export interface CallOutcome {
  key: string;
  /** Hungarian button label. */
  label: string;
  /** stored on Interaction.outcome. */
  interactionOutcome: string;
  /** UI accent token. */
  tone: string;
  /** Default follow-up offset in days (0 = no follow-up suggested). */
  followupDays: number;
}

// Order = button order. The judgment calls (interested/not/wants/bad) set the
// status explicitly; "no answer" and "note only" are handled by nextStatusFor.
export const CALL_OUTCOMES: CallOutcome[] = [
  { key: "no_answer",      label: "Nem vették fel", interactionOutcome: "no_answer",      tone: "var(--amber)", followupDays: 3 },
  { key: "interested",     label: "Érdeklődik",     interactionOutcome: "interested",     tone: "var(--sky)",   followupDays: 7 },
  { key: "wants",          label: "Kéri / akarja",  interactionOutcome: "wants",          tone: "var(--mint)",  followupDays: 2 },
  { key: "not_interested", label: "Nem érdekli",    interactionOutcome: "not_interested", tone: "var(--coral)", followupDays: 0 },
  { key: "bad_number",     label: "Rossz szám",     interactionOutcome: "bad_number",     tone: "var(--fg-faint)", followupDays: 0 },
  { key: "note_only",      label: "Csak jegyzet",   interactionOutcome: "note",           tone: "var(--fg-mute)",  followupDays: 0 },
];

const OUTCOME_BY_KEY = new Map(CALL_OUTCOMES.map((o) => [o.key, o]));

export function outcomeMeta(key: string): CallOutcome | undefined {
  return OUTCOME_BY_KEY.get(key);
}

export function isCallOutcome(key: string): boolean {
  return OUTCOME_BY_KEY.has(key);
}

/**
 * The pipeline status a company should move to after a call with this outcome,
 * or null to leave the status unchanged.
 *
 * The judgment outcomes are explicit human reads → always set:
 *   interested → 3, wants → 5, not_interested → 4, bad_number → 0.
 * "No answer" must NOT downgrade a company we already qualified — it only marks
 * the first attempt: Nem hívtuk(1) → NV(2); from any other status it stays put
 * (we still log the attempt + refresh lastInteractionDate in the action).
 * "Note only" never changes status.
 */
export function nextStatusFor(
  outcomeKey: string,
  currentStatus: string | null | undefined,
): string | null {
  switch (outcomeKey) {
    case "interested":     return "3";
    case "wants":          return "5";
    case "not_interested": return "4";
    case "bad_number":     return "0";
    case "no_answer":      return currentStatus === "1" ? "2" : null;
    case "note_only":      return null;
    default:               return null;
  }
}
