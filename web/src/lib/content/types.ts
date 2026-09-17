// Content approval pipeline — shared enums (spec 2026-09-17). Plain strings in
// the DB; these arrays are the single source of truth for Zod and the UI.

export const CONTENT_STATUSES = [
  "draft",
  "in_review",
  "changes_requested",
  "rewrite_requested",
  "ai_working",
  "live",
  "archived",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export function isContentStatus(v: unknown): v is ContentStatus {
  return typeof v === "string" && (CONTENT_STATUSES as readonly string[]).includes(v);
}

export const VERDICTS = ["approve", "changes", "rewrite"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const CONTENT_CATEGORIES = ["script", "email", "ad", "lead_magnet", "landing", "video", "image", "other"] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

/** What the AI may pick up. */
export const REQUESTABLE_STATUSES: ContentStatus[] = ["changes_requested", "rewrite_requested"];

/** An AI claim older than this is released (spec §1). */
export const CLAIM_TTL_MS = 2 * 60 * 60 * 1000;

export const CONTENT_BODY_MAX = 50_000;
export const REVIEW_COMMENT_MAX = 4_000;
export const CHANGE_NOTE_MAX = 4_000;

/**
 * Waiting longer than this on a reviewer is highlighted (spec §5). Lives here
 * (not in queries.ts) so pure modules — digest.ts included — can import it
 * without dragging in a DB dependency; queries.ts re-exports it for its own
 * callers.
 */
export const STALE_REVIEW_MS = 3 * 24 * 60 * 60 * 1000;
