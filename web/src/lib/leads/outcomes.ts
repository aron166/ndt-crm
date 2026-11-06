import { z } from "zod";
import { SCRIPT_KEY_MAX } from "./scripts";
import { BOOKING_KINDS } from "@/lib/booking/priority";
import {
  CALL_OUTCOMES, CALL_STAGE_CHAIN, DEMO_HOSTS, DEMO_STATUS, LOST_REASON_MAX, LOST_REASON_MIN,
  RECALL_STATUS, TECHNOLOGY_WORD_MAX, isLostCallOutcome, type CallOutcomeKey,
} from "./vocab";

// Lead call-outcome logging — PURE module (no DB), shared by the UI modal, the
// server action and the public API. The note-required / callback rules live in
// the Zod schema here; the stage/outcome transition lives in planCallOutcome.
// The DB side (one shared server function) is lib/leads/service.ts.

const CALL_OUTCOME_KEYS = CALL_OUTCOMES.map((o) => o.key) as [CallOutcomeKey, ...CallOutcomeKey[]];

// Wire/UI payload. Server-side validation: a note is ALWAYS required; a callback
// needs an explicit date+time; a booked meeting needs to say with whom.
export const callOutcomeSchema = z
  .object({
    outcome: z.enum(CALL_OUTCOME_KEYS),
    note: z.string().trim().min(1, "Megjegyzés kötelező").max(8000),
    /** ISO datetime — required when outcome = callback_requested. */
    callbackAt: z.coerce.date().optional(),
    /** Required when outcome = meeting_booked. */
    demoWith: z.enum(DEMO_HOSTS).optional(),
    /** meeting_booked: when the demo/visit starts. Required for UI users only (bookingIssue). */
    bookingAt: z.coerce.date().optional(),
    /** Goes with bookingAt — the priority rung (lib/booking/priority.ts). */
    bookingKind: z.enum(BOOKING_KINDS).optional(),
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
    /**
     * The customer's OWN word for the technology, what they called it on the
     * phone (e.g. "anyagvizsgálat", "roncsolásmentes", "falvastagságmérés").
     * Free text, deliberately NEVER validated against a known-value list. The
     * whole point is to capture wording we do not already have a slug for.
     */
    technologyWord: z.string().trim().min(1).max(TECHNOLOGY_WORD_MAX).optional(),
    /**
     * Auto-outcome provenance, written on the SAME interaction insert (trust
     * ladder, 2026-09-18). Interactions are append-only — decisions.md #2 — so
     * these can never be stamped on afterwards; they travel with the create or
     * not at all. `callId` is unique per tenant, which makes a repeated POST
     * fail INSIDE the transaction rather than after a partial write.
     */
    transcript: z.string().trim().max(100_000).optional(),
    autoConfidence: z.number().min(0).max(1).optional(),
    callId: z.string().trim().max(200).optional(),
    /** The interaction this one replaces: a correction, or a parse answering a transcript. */
    supersedesInteractionId: z.number().int().positive().optional(),
    /**
     * When the CALL happened, if that is not now. A parse of yesterday's queued
     * transcript belongs on the timeline at the time of the call, not of the
     * parse — it also feeds lastInteractionDate and the closeness score. Never
     * in the future (superRefine below).
     */
    occurredAt: z.coerce.date().optional(),
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
    // The booking fields come as a PAIR (a date without a rung cannot be ranked).
    // Whether they are required at all depends on WHO is calling — see
    // bookingIssue() below; the schema is shared with API callers.
    if (d.bookingAt && !d.bookingKind) {
      ctx.addIssue({ code: "custom", path: ["bookingKind"], message: "Add meg a foglalás típusát" });
    }
    if (d.bookingKind && !d.bookingAt) {
      ctx.addIssue({ code: "custom", path: ["bookingAt"], message: "Foglaláshoz dátum és óra kötelező" });
    }
    if (d.bookingAt && d.outcome !== "meeting_booked") {
      ctx.addIssue({ code: "custom", path: ["bookingAt"], message: "Foglalás csak demó-egyeztetésnél adható meg" });
    }
    if (d.occurredAt && d.occurredAt.getTime() > Date.now() + 60_000) {
      ctx.addIssue({ code: "custom", path: ["occurredAt"], message: "A hívás időpontja nem lehet a jövőben" });
    }
    if (isLostCallOutcome(d.outcome) && (d.lostReason ?? "").length < LOST_REASON_MIN) {
      ctx.addIssue({ code: "custom", path: ["lostReason"], message: `Az elvesztés oka kötelező (min. ${LOST_REASON_MIN} karakter)` });
    }
  });
export type CallOutcomeInput = z.infer<typeof callOutcomeSchema>;

/**
 * The actor-dependent booking rules (Kai ruling 2026-09-17, PR #97 finding 1).
 *
 * - UI users (modal, /drive) MUST give a date + rung for `meeting_booked`.
 * - API/agent callers keep the pre-booking contract: the fields are optional,
 *   and without them no booking task is created. Making them mandatory would
 *   turn every existing caller's working payload into a 400.
 * - Whoever sends a date: it cannot be in the past.
 *
 * Returns the first problem as a Zod-style issue, or null.
 */
export function bookingIssue(
  input: Pick<CallOutcomeInput, "outcome" | "bookingAt">,
  actor: "user" | "agent",
  now: Date,
): { path: "bookingAt"; message: string } | null {
  if (input.outcome !== "meeting_booked") return null;
  if (!input.bookingAt) {
    return actor === "user" ? { path: "bookingAt", message: "Foglaláshoz dátum és óra kötelező" } : null;
  }
  if (input.bookingAt.getTime() < now.getTime()) {
    return { path: "bookingAt", message: "A foglalás időpontja nem lehet a múltban" };
  }
  return null;
}

export interface CallOutcomePlan {
  /** New lead status, or null = unchanged. */
  status: string | null;
  /** Set when the outcome closes the lead as lost. */
  lost: { lostReason: string } | null;
  /** A callback task to create (callback_requested only). */
  callbackAt: Date | null;
  /** A booking task to create (meeting_booked only). */
  bookingAt: Date | null;
  bookingKind: (typeof BOOKING_KINDS)[number] | null;
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
  const plan: CallOutcomePlan = { status: null, lost: null, callbackAt: null, bookingAt: null, bookingKind: null };

  switch (input.outcome) {
    case "no_answer": {
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
      plan.bookingAt = input.bookingAt ?? null;
      plan.bookingKind = input.bookingKind ?? null;
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
    if (raw !== null) window.alert(`Az elvesztés oka kötelező (min. ${LOST_REASON_MIN} karakter).`);
    return null;
  }
  return reason.slice(0, LOST_REASON_MAX);
}
