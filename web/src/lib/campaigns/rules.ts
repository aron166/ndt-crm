// Campaigns slice 1: PURE rules, no DB (docs/proposals/2026-11-11-prospects-and-campaigns.md v2).
// A prospect is a company with no open lead; its state in one campaign is a campaign_members row.
// This file decides: which step a new member starts on, what a call or e-mail outcome does to a
// member (and whether it becomes a lead, in which stage), today's capped call list, and the
// approval hash. The DB side is lib/campaigns/service.ts.

import { createHash } from "node:crypto";
import { addWorkingDays, localDay, type LocalDay } from "@/lib/booking/time";

export const CAMPAIGN_KINDS = ["content", "ad", "organic", "cold_call", "cold_email", "sequence"] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];
/** Kinds with per-member touches (members, a call list). ad, organic and content are content only for now. */
export const MEMBER_KINDS: readonly CampaignKind[] = ["cold_call", "cold_email", "sequence"];
export const CAMPAIGN_STATUSES = ["draft", "running", "paused", "stopped", "done"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const STEP_CHANNELS = ["email", "call", "ad", "post", "dm"] as const;
export type StepChannel = (typeof STEP_CHANNELS)[number];
/**
 * A step's condition (item 4), a small fixed set: everyone, no reply yet, replied, the previous call
 * was not answered. "Opened" is NOT available: opens are not tracked.
 */
export const AUDIENCE_RULES = ["all", "no_reply", "replied", "no_answer"] as const;
export type StepCondition = (typeof AUDIENCE_RULES)[number];
/** Who a campaign touches: prospects from a list (companies with no open lead) or open leads in chosen stages. */
export const AUDIENCE_SOURCES = ["prospect_list", "leads_by_stage"] as const;
export type AudienceSource = (typeof AUDIENCE_SOURCES)[number];
export const MEMBER_STATES = ["queued", "needs_contact", "needs_email", "promoted", "declined", "unreachable", "excluded", "done"] as const;
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
  /** The step's condition; absent = "all". */
  audienceRule?: string;
}

export interface MemberHistory { replied: boolean; lastCallOutcome: string | null }

/** Whether a member qualifies for a step. An unknown rule fails closed. */
export function conditionHolds(rule: string | undefined, h: MemberHistory): boolean {
  switch (rule ?? "all") {
    case "all": return true;
    case "no_reply": return !h.replied;
    case "replied": return h.replied;
    case "no_answer": return h.lastCallOutcome === "no_answer";
    default: return false;
  }
}

/** The first step after `position` whose condition holds for this member, or null (the sequence is over for them). */
export function nextApplicable(steps: readonly StepDef[], position: number, h: MemberHistory): StepDef | null {
  return sortSteps(steps).find((s) => s.position > position && conditionHolds(s.audienceRule, h)) ?? null;
}

/** After a mid-run edit a member keeps its place in line; one past the new end is done. */
export function remapAfterEdit(position: number, steps: readonly StepDef[]): { stepPosition: number; done: boolean } {
  const last = sortSteps(steps).at(-1)?.position ?? 1;
  return position > last ? { stepPosition: last, done: true } : { stepPosition: position, done: false };
}

/** Steps in order. Positions are 1-based and unique (DB unique index). */
export function sortSteps<T extends StepDef>(steps: readonly T[]): T[] {
  return [...steps].sort((a, b) => a.position - b.position);
}

export function firstCallStep(steps: readonly StepDef[]): StepDef | null {
  return sortSteps(steps).find((s) => s.channel === "call") ?? null;
}

/** The call script (content item) of the call step at `position`; none for another step, never a different step's (item 6). */
export function scriptItemFor(steps: readonly { position: number; channel: string; contentItemId: number | null }[], position: number): number | null {
  const s = steps.find((x) => x.position === position);
  return s?.channel === "call" ? s.contentItemId : null;
}

/** The step after `position`, or null at the end of the sequence. */
export function nextStep(steps: readonly StepDef[], position: number): StepDef | null {
  return sortSteps(steps).find((s) => s.position > position) ?? null;
}

/** Steps that touch one member (e-mail or call); ad, post and dm steps have no per-member touch. */
const isTouch = (s: { channel: string }) => s.channel === "email" || s.channel === "call";

/**
 * Where a new member starts (Áron 2026-11-11, "E-mail first for everyone"): every member, warm
 * or unknown, starts on the campaign's first touch step. No member skips an e-mail step: one
 * without an e-mail address on an e-mail step is needs_email (listed as "needs an e-mail
 * first", never called); one without a phone on a call step is needs_contact. stepsFitKind
 * guarantees a sequence opens with an e-mail and a cold_call campaign has call steps only.
 */
export function startFor(
  steps: readonly StepDef[],
  m: { hasEmail: boolean; hasPhone: boolean },
): { stepPosition: number; state: "queued" | "needs_contact" | "needs_email" } {
  const ordered = sortSteps(steps);
  const first = ordered.find(isTouch);
  if (!first) return { stepPosition: ordered[0]?.position ?? 1, state: "needs_contact" };
  if (first.channel === "email") return { stepPosition: first.position, state: m.hasEmail ? "queued" : "needs_email" };
  return { stepPosition: first.position, state: m.hasPhone ? "queued" : "needs_contact" };
}

/**
 * Which steps a campaign kind may have (null = fine). sequence: an e-mail before any call;
 * cold_call: calls only (the pure cold-call type, chosen at creation); cold_email: e-mails
 * only; ad, organic, content and a pre-v2 row (kind null): content only, no per-member touch.
 */
export function stepsFitKind(kind: CampaignKind | null, steps: readonly { channel: string; position: number }[], audience: AudienceSource = "prospect_list"): string | null {
  const touches = [...steps].sort((a, b) => a.position - b.position).filter(isTouch);
  if (kind === "sequence") {
    if (touches.length === 0) return null; // steps not set yet
    // E-mail first is Áron's order for prospects; retargeting and nurture of existing leads may open with a call.
    if (audience === "prospect_list" && touches[0].channel !== "email") return "Sorozatban az e-mail lépés az első, a hívás csak utána jöhet";
    return null;
  }
  if (kind === "cold_call") return touches.some((s) => s.channel !== "call") ? "Hideg hívás kampányban csak hívás lépés lehet" : null;
  if (kind === "cold_email") return touches.some((s) => s.channel !== "email") ? "Hideg e-mail kampányban csak e-mail lépés lehet" : null;
  return touches.length ? "Ez a kampánytípus csak tartalom, nincs e-mail vagy hívás lépése" : null;
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
  /** The member replied earlier in this campaign (a campaign event). Absent = false. */
  replied?: boolean;
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

export const OPEN_MEMBER_STATES: readonly MemberState[] = ["queued", "needs_contact", "needs_email"];

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
  // A call outcome needs a queued member on a call step: nobody is called before the e-mail
  // went out, and a needs_email member is never called instead (Vanda #188 r2-2).
  if (CALL_OUTCOME_KEYS.includes(outcome as CallOutcomeKey) && outcome !== "note_only") {
    const step = steps.find((s) => s.position === m.stepPosition);
    if (m.state !== "queued" || step?.channel !== "call") return { error: "Ez a tag most nem hívható (előbb az e-mail lépés jön)" };
  }
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
      if (attempts >= MAX_NO_ANSWER) {
        // A sequence with a follow-up for non-answerers moves them on instead of giving up (item 4).
        const next = nextApplicable(steps, m.stepPosition, { replied: Boolean(m.replied), lastCallOutcome: "no_answer" });
        if (next && (next.channel !== "call" || m.hasPhone)) {
          return plan({ attempts: 0, stepPosition: next.position, nextEligibleOn: addWorkingDays(today, next.waitDays).key });
        }
        return plan({ attempts, state: "unreachable" });
      }
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
      // The e-mail went out: move to the next step whose condition holds, eligible after its wait in working days.
      const next = nextApplicable(steps, m.stepPosition, { replied: Boolean(m.replied), lastCallOutcome: null });
      if (!next) return plan({ state: "done" });
      if (next.channel === "call" && !m.hasPhone) return plan({ state: "done" });
      return plan({ stepPosition: next.position, nextEligibleOn: addWorkingDays(today, next.waitDays).key });
    }
    case "reply_positive": {
      // A reply stops the e-mail steps: a sequence with a call step for repliers moves the member there,
      // callable today (item 4). Without one the reply promotes, as before (first call within the hour).
      const call = sortSteps(steps).find((s) => s.position > m.stepPosition && s.channel === "call" && s.audienceRule === "replied");
      if (call && m.hasPhone) return plan({ stepPosition: call.position, nextEligibleOn: today.key });
      return plan({ state: "promoted" }, {
        promote: { stage: "new", nextAction: "Első hívás (SLA)", dueInWorkingDays: 0, sla: true },
      });
    }
    case "reply_negative":
      return plan({ state: "declined" });
    case "unsubscribe":
      return plan({ state: "declined" }, { suppress: true });
    case "bounce":
      // A dead address is no e-mail: the member waits for a working one and is never called
      // instead (Áron 2026-11-11, nobody is called before an e-mail went out).
      // The dead address is suppressed so a reload with the same address cannot requeue it (Vanda #188 r2-1).
      return plan({ state: "needs_email" }, { suppress: true });
  }
}

/** The campaign automation triggers a touch raises (item 5), in order. Pure. */
export function campaignAutomationEvents(
  outcome: OutcomeKey,
  r: { promoted: boolean; stepFrom: number; stepTo: number; done: boolean },
): ("campaign_member_replied" | "campaign_member_promoted" | "campaign_call_outcome" | "campaign_step_completed")[] {
  const out: ReturnType<typeof campaignAutomationEvents> = [];
  if (outcome === "reply_positive" || outcome === "reply_negative") out.push("campaign_member_replied");
  if (CALL_OUTCOME_KEYS.includes(outcome as CallOutcomeKey) && outcome !== "note_only") out.push("campaign_call_outcome");
  if (outcome === "email_sent" && (r.stepTo !== r.stepFrom || r.done)) out.push("campaign_step_completed");
  if (r.promoted) out.push("campaign_member_promoted");
  return out;
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
  /** Whether promoted leads may fire send_email / webhook_out rules; omitted = false. */
  outboundAutomations?: boolean;
}): string {
  const payload = JSON.stringify({
    m: [...input.memberCompanyIds].sort((a, b) => a - b),
    // A condition joins the tuple only when set, so plans hashed before conditions existed still match.
    s: sortSteps(input.steps).map((s) => (s.audienceRule && s.audienceRule !== "all" ? [s.position, s.channel, s.waitDays, s.contentItemId, s.audienceRule] : [s.position, s.channel, s.waitDays, s.contentItemId])),
    c: input.dailyCap,
    // Only in the payload when on, so every hash computed before this flag existed still matches.
    ...(input.outboundAutomations ? { o: 1 } : {}),
  });
  return createHash("sha256").update(payload).digest("hex");
}

/** Whether `today` (YYYY-MM-DD, Budapest) is inside the campaign's dates; an open end is no limit. */
export function inWindow(startsOn: string | null, endsOn: string | null, today: string): boolean {
  return (startsOn == null || startsOn <= today) && (endsOn == null || today <= endsOn);
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
