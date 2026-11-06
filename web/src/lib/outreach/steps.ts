/**
 * How many touches a cold-email sequence has. Its own leaf module on purpose:
 * `lib/outreach/drafts.ts` imports zod, and pulling this constant from there
 * into `lib/content/labels.ts` dragged zod into the client bundle of every
 * /marketing route - 225 KB over budget on three routes (CI, 2026-09-18).
 * Nothing may be added to this file that imports anything.
 */

/** Touch N is due this many days after touch 1 went out (SEND_PLAN: day 1/4/8/15). */
export const SEQUENCE_OFFSET_DAYS = [0, 3, 7, 14] as const;
export const MAX_STEP = SEQUENCE_OFFSET_DAYS.length;

/** Highest campaign wave number accepted anywhere (forms, actions, agent payload). */
export const WAVE_MAX = 52;

export function isValidStep(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_STEP;
}

// `sending` is a CLAIM, not a user-visible stage: sendDraft moves the row into
// it in one conditional UPDATE before it talks to Resend, so a double-click, a
// second tab, or a retried server-action POST finds nothing left to claim. A row
// stuck in `sending` means the process died mid-send - deliberately NOT
// re-sendable, because we cannot know whether the mail went out. (Vanda, #88.)
// `cancelled` is the terminal state for a queued touch that has been overtaken
// by events - today, the prospect replied, so touches 2-4 must not go out.
// Without it a reply flipped only the SENT rows and a human could still send
// cold touch 3 to someone who already answered. (Vanda, #89.)
export const DRAFT_STATUSES = ["draft", "approved", "sending", "sent", "failed", "replied", "cancelled"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/** Rows that have not gone out yet (a reply or suppression may still cancel them). */
export const UNSENT_STATUSES = ["draft", "approved", "failed"] as const;

export function canSend(status: DraftStatus): boolean {
  return status === "approved" || status === "failed";
}

/** The statuses sendDraft (and "sent by hand") may claim. Derived from canSend(). */
export const CLAIMABLE_STATUSES: DraftStatus[] = DRAFT_STATUSES.filter((s) => canSend(s));

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
