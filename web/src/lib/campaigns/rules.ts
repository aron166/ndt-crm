// Campaigns slice 1: PURE rules, no DB (docs/proposals/2026-11-11-prospects-and-campaigns.md v2).
// A prospect is a company with no open lead; its state in one campaign is a campaign_members row.
// This file decides: which step a new member starts on, what a call or e-mail outcome does to a
// member (and whether it becomes a lead, in which stage), today's capped call list, and the
// approval hash. The DB side is lib/campaigns/service.ts.

import { createHash } from "node:crypto";
import { addWorkingDays, localDay, type LocalDay } from "@/lib/booking/time";

export const CAMPAIGN_KINDS = ["content", "ad", "organic", "cold_call", "cold_email", "sequence"] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];
export const CAMPAIGN_STATUSES = ["draft", "running", "paused", "stopped", "done"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const STEP_CHANNELS = ["email", "call", "ad", "post", "dm"] as const;
export type StepChannel = (typeof STEP_CHANNELS)[number];
export const AUDIENCE_RULES = ["all", "no_reply", "no_answer"] as const;
export const MEMBER_STATES = ["queued", "needs_contact", "promoted", "declined", "unreachable", "excluded", "done"] as const;
export type MemberState = (typeof MEMBER_STATES)[number];

export const DEFAULT_DAILY_CAP = 15;
export const DAILY_CAP_MAX = 200;
/** A "no answer" puts the member back on the list this many working days later. */
export const NO_ANSWER_RETRY_WORKING_DAYS = 2;
/** After this many unanswered calls the member is unreachable (stays a prospect, off the list). */
export const MAX_NO_ANSWER = 3;

export interface StepDef {
  position: number;
  channel: StepChannel;
  waitDays: number;
}

/** Steps in order. Positions are 1-based and unique (DB unique index). */
export function sortSteps<T extends StepDef>(steps: readonly T[]): T[] {
  return [...steps].sort((a, b) => a.position - b.position);
}

export function firstCallStep(steps: readonly StepDef[]): StepDef | null {
  return sortSteps(steps).find((s) => s.channel === "call") ?? null;
}

/** The step after `position`, or null at the end of the sequence. */
export function nextStep(steps: readonly StepDef[], position: number): StepDef | null {
  return sortSteps(steps).find((s) => s.position > position) ?? null;
}

/**
 * Where a new member starts (Áron 2026-11-03 and 2026-11-11): Péter's own past clients are
 * phone only and start on the first call step; unknown firms start at step 1 (the e-mail
 * first); a member without an e-mail address skips e-mail steps; no phone and no e-mail =
 * needs_contact, never on any list until enrichment adds one.
 */
export function startFor(
  steps: readonly StepDef[],
  m: { phoneOnly: boolean; hasEmail: boolean; hasPhone: boolean },
): { stepPosition: number; state: "queued" | "needs_contact" } {
  const ordered = sortSteps(steps);
  const usable = ordered.find((s) => {
    if (s.channel === "email") return m.hasEmail && !m.phoneOnly;
    if (s.channel === "call") return m.hasPhone;
    return false; // ad / post / dm steps have no per-member touch in slice 1
  });
  if (!usable) return { stepPosition: ordered[0]?.position ?? 1, state: "needs_contact" };
  return { stepPosition: usable.position, state: "queued" };
}

// ---------------------------------------------------------------------------------------------
// Outcomes

/** Hívás mód outcome keys (lib/outreach/queue.ts CALL_OUTCOMES), the same taps. */
export const CALL_OUTCOME_KEYS = ["no_answer", "interested", "wants", "not_interested", "bad_number", "note_only"] as const;
export type CallOutcomeKey = (typeof CALL_OUTCOME_KEYS)[number];
export const EMAIL_EVENTS = ["email_sent", "reply_positive", "reply_negative", "unsubscribe", "bounce"] as const;
export type EmailEvent = (typeof EMAIL_EVENTS)[number];
export type OutcomeKey = CallOutcomeKey | EmailEvent;
export const OUTCOME_KEYS: readonly string[] = [...CALL_OUTCOME_KEYS, ...EMAIL_EVENTS];

export interface MemberSnapshot {
  state: MemberState;
  stepPosition: number;
  attempts: number;
  hasPhone: boolean;
}

/** What a promotion creates. `sla` true only for an e-mail reply: the replier gets the first call within the hour. */
export interface PromotionPlan {
  stage: "new" | "contacting" | "qualified";
  nextAction: string;
  /** Working days until next_due; ignored when sla is true (the SLA timer sets it). */
  dueInWorkingDays: number;
  sla: boolean;
}

export interface OutcomePlan {
  /** Columns to write on the member. */
  member: {
    state: MemberState;
    stepPosition: number;
    attempts: number;
    nextEligibleOn: string | null; // YYYY-MM-DD, Budapest
    lastOutcome: string;
  };
  promote: PromotionPlan | null;
  /** Write a suppression for the address (unsubscribe). */
  suppress: boolean;
  /** Log an append-only interaction on the company (calls; e-mails are logged by outreach itself). */
  logCall: boolean;
}

export const OPEN_MEMBER_STATES: readonly MemberState[] = ["queued", "needs_contact"];

export type PlanError = { error: string };

/**
 * The promotion rule (v2.6). Pure: `today` is the Budapest day of the touch.
 * A closed member (promoted, declined, ...) takes no further outcome except note_only.
 */
export function planOutcome(
  m: MemberSnapshot,
  outcome: OutcomeKey,
  steps: readonly StepDef[],
  today: LocalDay,
): OutcomePlan | PlanError {
  const open = OPEN_MEMBER_STATES.includes(m.state);
  if (!open && outcome !== "note_only") return { error: `A tag már lezárt (${m.state})` };
  const base = { state: m.state, stepPosition: m.stepPosition, attempts: m.attempts, nextEligibleOn: null as string | null, lastOutcome: outcome };
  const plan = (member: Partial<OutcomePlan["member"]>, extra: Partial<Omit<OutcomePlan, "member">> = {}): OutcomePlan => ({
    member: { ...base, ...member },
    promote: null,
    suppress: false,
    logCall: CALL_OUTCOME_KEYS.includes(outcome as CallOutcomeKey),
    ...extra,
  });

  switch (outcome) {
    case "note_only":
      return plan({});
    case "no_answer": {
      const attempts = m.attempts + 1;
      if (attempts >= MAX_NO_ANSWER) return plan({ attempts, state: "unreachable" });
      return plan({ attempts, nextEligibleOn: addWorkingDays(today, NO_ANSWER_RETRY_WORKING_DAYS).key });
    }
    case "interested":
      return plan({ attempts: m.attempts + 1, state: "promoted" }, {
        promote: { stage: "contacting", nextAction: "Visszahívás", dueInWorkingDays: 5, sla: false },
      });
    case "wants":
      return plan({ attempts: m.attempts + 1, state: "promoted" }, {
        promote: { stage: "qualified", nextAction: "Ajánlat vagy bemutató egyeztetése", dueInWorkingDays: 2, sla: false },
      });
    case "not_interested":
      return plan({ attempts: m.attempts + 1, state: "declined" });
    case "bad_number":
      return plan({ attempts: m.attempts + 1, state: "excluded" });
    case "email_sent": {
      // The e-mail went out: move to the next step, eligible after its wait.
      const next = nextStep(steps, m.stepPosition);
      if (!next) return plan({ state: "done" });
      if (next.channel === "call" && !m.hasPhone) return plan({ state: "done" });
      return plan({ stepPosition: next.position, nextEligibleOn: addWorkingDays(today, next.waitDays).key });
    }
    case "reply_positive":
      return plan({ state: "promoted" }, {
        promote: { stage: "new", nextAction: "Első hívás (SLA)", dueInWorkingDays: 0, sla: true },
      });
    case "reply_negative":
      return plan({ state: "declined" });
    case "unsubscribe":
      return plan({ state: "declined" }, { suppress: true });
    case "bounce":
      // A dead address: fall through to the call step if there is one, else out.
      {
        const call = sortSteps(steps).find((s) => s.channel === "call" && s.position > m.stepPosition);
        if (call && m.hasPhone) return plan({ stepPosition: call.position, nextEligibleOn: today.key });
        return plan({ state: "excluded" });
      }
  }
}

// ---------------------------------------------------------------------------------------------
// Today's list

export interface ListCandidate {
  id: number;
  state: string;
  stepPosition: number;
  nextEligibleOn: string | null; // YYYY-MM-DD
  priority: number;
  city: string | null;
  lastTouchedAt: Date | null;
}

/** Midnight in Budapest is the day boundary for "touched today". */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return localDay(a).key === localDay(b).key;
}

/**
 * The capped daily call list, computed on read (no cron, no tasks made in advance): queued
 * members on a call step whose next_eligible_on is today or earlier, priority (lower first),
 * then city, then id; at most `cap` minus the members of this campaign already touched today.
 * Returns the ids in order plus the count left after today.
 */
export function selectDailyList(
  candidates: readonly ListCandidate[],
  callSteps: ReadonlySet<number>,
  cap: number,
  now: Date,
): { ids: number[]; touchedToday: number; remaining: number; waiting: number } {
  const today = localDay(now).key;
  const touchedToday = candidates.filter((c) => c.lastTouchedAt && isSameLocalDay(c.lastTouchedAt, now)).length;
  const eligible = candidates
    .filter((c) => c.state === "queued" && callSteps.has(c.stepPosition))
    .filter((c) => !(c.lastTouchedAt && isSameLocalDay(c.lastTouchedAt, now)))
    .filter((c) => c.nextEligibleOn == null || c.nextEligibleOn <= today)
    .sort((a, b) => a.priority - b.priority || (a.city ?? "￿").localeCompare(b.city ?? "￿", "hu") || a.id - b.id);
  const room = Math.max(0, cap - touchedToday);
  const ids = eligible.slice(0, room).map((c) => c.id);
  const waiting = candidates.filter((c) => c.state === "queued" && callSteps.has(c.stepPosition)).length;
  return { ids, touchedToday, remaining: Math.max(0, waiting - ids.length), waiting };
}

// ---------------------------------------------------------------------------------------------
// Approval

/**
 * What Áron approves: the exact member set, the steps and the cap. Stored at approval; an edit
 * to any of them returns a running campaign to draft (service), so the hash is the audit proof
 * of what was launched.
 */
export function approvalHash(input: {
  memberCompanyIds: readonly number[];
  steps: readonly (StepDef & { contentItemId: number | null })[];
  dailyCap: number;
}): string {
  const payload = JSON.stringify({
    m: [...input.memberCompanyIds].sort((a, b) => a - b),
    s: sortSteps(input.steps).map((s) => [s.position, s.channel, s.waitDays, s.contentItemId]),
    c: input.dailyCap,
  });
  return createHash("sha256").update(payload).digest("hex");
}

/** Status moves a caller may ask for. `running` is only reached through approve. */
export function canSetStatus(from: CampaignStatus, to: "paused" | "stopped" | "done"): boolean {
  if (to === "paused") return from === "running";
  if (to === "stopped") return from === "running" || from === "paused" || from === "draft";
  return from === "running" || from === "paused";
}

export function canApprove(from: CampaignStatus): boolean {
  return from === "draft" || from === "paused";
}

/** Lead stages in order, for "move an existing open lead forward only". */
export function isForwardMove(stages: readonly string[], from: string | null, to: string): boolean {
  const a = from == null ? -1 : stages.indexOf(from);
  if (from != null && a < 0) return false; // a side stage (recall, lost) is never moved by a campaign
  return stages.indexOf(to) > a;
}
