import { z } from "zod";
import type { DraftStatus } from "./drafts";
import { MAX_STEP, CLAIMABLE_STATUSES } from "./drafts";

/**
 * Campaign tracking (Kai/Áron P0, 2026-09-17) — PURE module, no DB.
 *
 * Round one of cold-email-v0 is sent BY HAND from two personal Gmail inboxes,
 * so the CRM cannot send it; it can only be TOLD it was sent. This module owns
 * the rules shared by the server actions, the /outreach UI and the dashboard:
 * the touch cadence, which rows can be marked sent, the reply types, and the
 * funnel/target math. Every number on the dashboard is computed from rows by
 * `buildFunnel` — there is no cached counter anywhere.
 */

/** Touch N is due this many days after touch 1 went out (SEND_PLAN: day 1/4/8/15). */
export const SEQUENCE_OFFSET_DAYS = [0, 3, 7, 14] as const;
/** Touches go out in the morning window (SEND_PLAN §1: 8:00–9:00, server-local = Budapest). */
export const SEND_HOUR = 8;

/**
 * Due date of `nextStep`, given when touch 1 actually went out. Always at
 * SEND_HOUR local time on that day. Null when there is no such step.
 */
export function dueAtForStep(firstSentAt: Date, nextStep: number): Date | null {
  const offset = SEQUENCE_OFFSET_DAYS[nextStep - 1];
  if (offset === undefined) return null;
  const d = new Date(firstSentAt);
  d.setDate(d.getDate() + offset);
  d.setHours(SEND_HOUR, 0, 0, 0);
  return d;
}

/**
 * "Kézzel elküldve" is allowed from exactly the states the Resend path may send
 * from — a human still approves the copy first.
 */
export const MANUAL_SENDABLE_STATUSES: DraftStatus[] = CLAIMABLE_STATUSES;
export function canMarkSent(status: DraftStatus): boolean {
  return MANUAL_SENDABLE_STATUSES.includes(status);
}

/** Only a touch that went out can be answered. */
export function canMarkReplied(status: DraftStatus): boolean {
  return status === "sent";
}

/** SEND_PLAN §3 reply_type, as stable English keys. Labels are UI. */
export const REPLY_TYPES = [
  "interested", // érdeklődő
  "question", // kérdés
  "forwarded", // továbbküldte
  "not_now", // most nem
  "no", // nem
  "unsubscribed", // leiratkozott
  "auto_reply", // automatikus válasz (szabadság, „nem én vagyok az illetékes”)
] as const;
export type ReplyType = (typeof REPLY_TYPES)[number];

export const markSentSchema = z.object({
  draftId: z.number().int().positive(),
  /** Gmail thread id, optional — pasted from the address bar. */
  externalThreadId: z.string().trim().max(200).optional(),
});

export const markRepliedSchema = z.object({
  draftId: z.number().int().positive(),
  replyType: z.enum(REPLY_TYPES),
  note: z.string().trim().max(4000).optional(),
});

/** SEND_PLAN §5 — when we say the campaign works. */
export const CAMPAIGN_TARGETS = {
  replyRate: 0.25,
  calls: 4,
  tierAB: 1,
} as const;

// ── Funnel ──────────────────────────────────────────────────────────────────

export interface FunnelDraftRow {
  companyId: number;
  step: number;
  status: string;
  sentAt: Date | null;
  replyType: string | null;
}
export interface FunnelLeadRow {
  tier: string | null;
  outcome: string;
}
export interface FunnelInteractionRow {
  type: string;
  outcome: string | null;
}

export interface CampaignFunnel {
  /** Distinct companies with at least one touch out. */
  companiesContacted: number;
  /** Touches out per step (index 0 = touch 1). A replied touch was sent too. */
  sentByStep: number[];
  /** Replied touches per step — "which touch gets the answer". */
  repliesByStep: number[];
  repliesByType: Record<string, number>;
  /** Distinct companies that answered at least once. */
  companiesReplied: number;
  /** companiesReplied / companiesContacted, null when nothing went out. */
  replyRate: number | null;
  calls: number;
  meetings: number;
  leadsByTier: Record<string, number>;
  won: number;
  targets: { replyRate: boolean; calls: boolean; tierAB: boolean };
}

const WENT_OUT = new Set(["sent", "replied"]);

export function buildFunnel(
  drafts: FunnelDraftRow[],
  leads: FunnelLeadRow[],
  interactions: FunnelInteractionRow[],
): CampaignFunnel {
  const sentByStep = Array.from({ length: MAX_STEP }, () => 0);
  const repliesByStep = Array.from({ length: MAX_STEP }, () => 0);
  const repliesByType: Record<string, number> = {};
  const contacted = new Set<number>();
  const replied = new Set<number>();

  for (const d of drafts) {
    if (!WENT_OUT.has(d.status)) continue;
    const i = d.step - 1;
    if (i >= 0 && i < MAX_STEP) sentByStep[i] += 1;
    contacted.add(d.companyId);
    if (d.status === "replied") {
      if (i >= 0 && i < MAX_STEP) repliesByStep[i] += 1;
      const key = d.replyType ?? "unknown";
      repliesByType[key] = (repliesByType[key] ?? 0) + 1;
      replied.add(d.companyId);
    }
  }

  const leadsByTier: Record<string, number> = {};
  let won = 0;
  for (const l of leads) {
    const t = l.tier ?? "none";
    leadsByTier[t] = (leadsByTier[t] ?? 0) + 1;
    if (l.outcome === "won") won += 1;
  }

  let calls = 0;
  let meetings = 0;
  for (const it of interactions) {
    if (it.type === "call") calls += 1;
    if (it.type === "meeting" || it.type === "site_visit" || it.outcome === "meeting_booked") meetings += 1;
  }

  const replyRate = contacted.size > 0 ? replied.size / contacted.size : null;
  const tierAB = (leadsByTier.A ?? 0) + (leadsByTier.B ?? 0);

  return {
    companiesContacted: contacted.size,
    sentByStep,
    repliesByStep,
    repliesByType,
    companiesReplied: replied.size,
    replyRate,
    calls,
    meetings,
    leadsByTier,
    won,
    targets: {
      replyRate: replyRate !== null && replyRate >= CAMPAIGN_TARGETS.replyRate,
      calls: calls >= CAMPAIGN_TARGETS.calls,
      tierAB: tierAB >= CAMPAIGN_TARGETS.tierAB,
    },
  };
}
