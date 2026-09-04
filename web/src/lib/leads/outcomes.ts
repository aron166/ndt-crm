import { z } from "zod";

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
    /** Optional: who the callback task is assigned to (defaults to the actor). */
    assignedToId: z.number().int().positive().optional(),
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
      plan.lost = { lostReason: input.outcome };
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
