// Outreach queue — pure logic, DB-free (mirrors lib/outreach/queue.ts).
//
// An external agent skill drafts personalized cold emails into `email_drafts`;
// a human reviews/approves them at /outreach; "Küldés" sends via the tenant's
// existing Resend integration (lib/integrations/resend.ts). Nothing sends
// itself. This module owns the three things that must never drift between the
// UI, the server actions, and the drafting agent's payload validation:
//   1. the draft state machine (who may edit/approve/send a row),
//   2. the thread-key format the later reply-intake contract matches replies on,
//   3. the consent-footer append rule (idempotent across approve→send).

import { z } from "zod";

export const DRAFT_STATUSES = ["draft", "approved", "sent", "failed", "replied"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export function isDraftStatus(v: unknown): v is DraftStatus {
  return typeof v === "string" && (DRAFT_STATUSES as readonly string[]).includes(v);
}

// The sequence step (1-4) a draft belongs to within a campaign.
export const MAX_STEP = 4;

export function isValidStep(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_STEP;
}

// The only authority on state transitions — UI and server actions both call
// these, so a sent row can never be edited or re-sent.
export function canEdit(status: DraftStatus): boolean {
  return status === "draft" || status === "failed";
}

export function canApprove(status: DraftStatus): boolean {
  return status === "draft";
}

export function canSend(status: DraftStatus): boolean {
  return status === "approved" || status === "failed";
}

/**
 * Deterministic thread key for campaign+company, e.g. ("BirdsView Q4", 12) ->
 * "birdsview-q4:12". The reply-intake contract (addendum item 3) matches
 * inbound replies on this string, so it must be stable and total.
 */
export function threadKeyFor(campaign: string, companyId: number): string {
  const slug = campaign
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // ponytail: empty/non-alphanumeric campaign names are rare (drafting agent
  // always sets one) but the key must never collide on "" — fall back to a
  // fixed segment rather than inventing a hash.
  return `${slug || "campaign"}:${companyId}`;
}

const FOOTER_SEPARATOR = "\n\n-- \n";

/**
 * Append the tenant's consent/unsubscribe footer, separated by a blank line
 * and a "-- " signature separator — but only once. Approving then sending
 * calls this on the same body twice; without the idempotency check the footer
 * would stack.
 */
export function withFooter(body: string, footer: string | null | undefined): string {
  const trimmedBody = body.replace(/\s+$/, "");
  const trimmedFooter = footer?.trim();
  if (!trimmedFooter) return trimmedBody;
  if (trimmedBody.endsWith(`${FOOTER_SEPARATOR}${trimmedFooter}`)) return trimmedBody;
  return `${trimmedBody}${FOOTER_SEPARATOR}${trimmedFooter}`;
}

export interface DraftUpsert {
  companyId: number;
  personId?: number | null;
  campaign: string;
  step: number;
  subject: string;
  body: string;
  toEmail?: string | null;
}

export const draftUpsertSchema = z.object({
  companyId: z.number().int().positive(),
  personId: z.number().int().positive().nullable().optional(),
  campaign: z.string().trim().min(1).max(80),
  step: z.number().int().min(1).max(MAX_STEP),
  subject: z.string().trim().min(1).max(300),
  body: z.string().min(1).max(20000),
  toEmail: z.string().email().nullable().optional(),
});

// Bulk drafting requests come from the agent skill in one batch; cap it so a
// single call can't hand the review queue thousands of rows at once.
export const MAX_BULK_DRAFTS = 200;

export const draftsUpsertSchema = z.array(draftUpsertSchema).max(MAX_BULK_DRAFTS);

export function validateUpsert(
  raw: unknown,
): { ok: true; value: DraftUpsert } | { ok: false; error: string } {
  const result = draftUpsertSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  const first = result.error.issues[0];
  const field = String(first?.path[0] ?? "value");
  return { ok: false, error: `Invalid ${field}: ${first?.message ?? "validation failed"}` };
}
