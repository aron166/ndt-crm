import { z } from "zod";
import { SCRIPT_KEY_MAX } from "./scripts";

// Lead call-outcome logging — PURE module (no DB), shared by the UI modal, the
// server action and the public API. The note-required / callback rules live in
// the Zod schema here; the stage/outcome transition lives in planCallOutcome.
// The DB side (one shared server function) is lib/leads/service.ts.

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
 * lost/disqualified" — the outcome key on its own is not a reason, so these two
 * additionally require a short free-text `lostReason`.
 */
export const LOST_CALL_OUTCOMES: readonly CallOutcomeKey[] = ["not_interested", "disqualified"];
export function isLostCallOutcome(key: string): boolean {
  return (LOST_CALL_OUTCOMES as readonly string[]).includes(key);
}
/**
 * Outcomes whose `.superRefine` rule above requires an extra field beyond the
 * note (callbackAt / demoWith / lostReason) — the client uses this only to
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
const CALL_OUTCOME_KEYS = CALL_OUTCOMES.map((o) => o.key) as [CallOutcomeKey, ...CallOutcomeKey[]];

export function callOutcomeLabel(key: string | null): string {
  return CALL_OUTCOMES.find((o) => o.key === key)?.label ?? key ?? "—";
}

export const DEMO_STATUS: Record<"aron" | "peter", string> = {
  aron: "demo_aron",
  peter: "demo_peter",
};

/** `no_answer` walks the lead along this chain (one step per attempt). */
export const CALL_STAGE_CHAIN = ["new", "call_1", "call_2", "call_3", "call_3_plus"] as const;
/** Áron may turn the auto-advance off later — one switch, here. */
export const AUTO_ADVANCE_ON_NO_ANSWER = true;
/** Stage a lead lands in when it asks for a callback. */
export const RECALL_STATUS = "recall";

// Wire/UI payload. Server-side validation: a note is ALWAYS required; a callback
// needs an explicit date+time; a booked meeting needs to say with whom.
export const callOutcomeSchema = z
  .object({
    outcome: z.enum(CALL_OUTCOME_KEYS),
    note: z.string().trim().min(1, "Megjegyzés kötelező").max(8000),
    /** ISO datetime — required when outcome = callback_requested. */
    callbackAt: z.coerce.date().optional(),
    /** Required when outcome = meeting_booked. */
    demoWith: z.enum(["aron", "peter"]).optional(),
    /** Required when the outcome is lost/disqualified — a short free text WHY. */
    lostReason: z.string().trim().max(LOST_REASON_MAX).optional(),
    /** Optional: who the callback task is assigned to (defaults to the actor). */
    assignedToId: z.number().int().positive().optional(),
    /**
     * Which call-script variant was used (A/B). The KEY only — the definitions
     * are tenant config. Validated against the tenant's list in the service, the
     * same way a qualification slug is: an unknown key is a 400, never a silent
     * write into a statistics bucket nobody is looking at.
     */
    scriptVariant: z.string().trim().min(1).max(SCRIPT_KEY_MAX).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.outcome === "callback_requested") {
      if (!d.callbackAt || Number.isNaN(d.callbackAt.getTime())) {
        ctx.addIssue({ code: "custom", path: ["callbackAt"], message: "Visszahíváshoz dátum és óra kötelező" });
      }
    }
    if (d.outcome === "meeting_booked" && !d.demoWith) {
      ctx.addIssue({ code: "custom", path: ["demoWith"], message: "Add meg, kivel lesz a demó (Áron / Péter)" });
    }
    if (isLostCallOutcome(d.outcome) && (d.lostReason ?? "").length < LOST_REASON_MIN) {
      ctx.addIssue({ code: "custom", path: ["lostReason"], message: "Az elvesztés oka kötelező (min. 3 karakter)" });
    }
  });
export type CallOutcomeInput = z.infer<typeof callOutcomeSchema>;

export interface CallOutcomePlan {
  /** New lead status, or null = unchanged. */
  status: string | null;
  /** Set when the outcome closes the lead as lost. */
  lost: { lostReason: string } | null;
  /** A callback task to create (callback_requested only). */
  callbackAt: Date | null;
}

/**
 * What a call outcome does to the lead — pure. `knownStatuses` guards the
 * transition: we never move a lead into a column the tenant deleted.
 */
export function planCallOutcome(
  input: CallOutcomeInput,
  currentStatus: string | null,
  knownStatuses: readonly string[],
): CallOutcomePlan {
  const known = (s: string) => knownStatuses.includes(s);
  const plan: CallOutcomePlan = { status: null, lost: null, callbackAt: null };

  switch (input.outcome) {
    case "no_answer": {
      if (!AUTO_ADVANCE_ON_NO_ANSWER) break;
      const i = CALL_STAGE_CHAIN.indexOf((currentStatus ?? "new") as (typeof CALL_STAGE_CHAIN)[number]);
      const next = i >= 0 && i < CALL_STAGE_CHAIN.length - 1 ? CALL_STAGE_CHAIN[i + 1] : null;
      if (next && known(next)) plan.status = next;
      break;
    }
    case "callback_requested":
      plan.callbackAt = input.callbackAt ?? null;
      if (known(RECALL_STATUS)) plan.status = RECALL_STATUS;
      break;
    case "meeting_booked": {
      const target = DEMO_STATUS[input.demoWith ?? "aron"];
      if (known(target)) plan.status = target;
      break;
    }
    case "not_interested":
    case "disqualified":
      // The schema guarantees lostReason here; the `??` is a type narrowing, not a default.
      plan.lost = { lostReason: input.lostReason ?? input.outcome };
      break;
    case "wrong_number":
      break;
  }
  if (plan.status === currentStatus) plan.status = null;
  return plan;
}

/** Callback-due badge tone for a due date: overdue → red, due within 24h → soft, else null. */
export function callbackTone(due: Date | string | null | undefined, now: Date = new Date()): "overdue" | "soon" | null {
  if (!due) return null;
  const ms = new Date(due).getTime() - now.getTime();
  if (ms < 0) return "overdue";
  if (ms <= 24 * 3_600_000) return "soon";
  return null;
}

/** Whole days since a date ("soha" when never). */
export function daysSince(date: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 86_400_000));
}

/**
 * Ask for the mandatory lost reason from the two manual outcome dropdowns (lead
 * card + lead detail). Returns null when the user cancels or types nothing usable
 * — the caller aborts, so a lead is never closed as lost without a why.
 *
 * ponytail: `window.prompt`, matching the `confirm()`/`alert()` already used on
 * both surfaces. The high-frequency path (setter logging a call) gets a real
 * required field in CallOutcomeModal; upgrade this to a dialog if the manual
 * dropdown turns out to be used often.
 */
export function promptLostReason(): string | null {
  const raw = window.prompt("Miért veszett el a lead? (kötelező)");
  const reason = raw?.trim() ?? "";
  if (reason.length < LOST_REASON_MIN) {
    if (raw !== null) window.alert("Az elvesztés oka kötelező (min. 3 karakter).");
    return null;
  }
  return reason.slice(0, LOST_REASON_MAX);
}
