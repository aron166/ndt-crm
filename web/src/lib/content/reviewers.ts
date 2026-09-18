import { z } from "zod";
import { db } from "@/lib/db";

/**
 * Who reviews content: `tenants.settings.contentReviewers` = one or two users.id
 * (configured, never hard-coded).
 *
 * How MANY approvals an item needs is a separate setting per category
 * (`contentApprovals`, below): the default is still two, so nothing changes
 * until Áron lowers it himself. A category that needs two approvals while only
 * one reviewer is configured can never go live, and the item says so.
 */
/** A tenant may run with one or two reviewers (Áron, 2026-09-17). */
export const MIN_REVIEWERS = 1;
export const MAX_REVIEWERS = 2;

const reviewersSchema = z.array(z.number().int().positive()).min(MIN_REVIEWERS).max(MAX_REVIEWERS);

export function reviewersFromSettings(settings: unknown): number[] {
  const parsed = reviewersSchema.safeParse((settings as { contentReviewers?: unknown } | null)?.contentReviewers);
  return parsed.success ? [...new Set(parsed.data)] : [];
}

/** Configured reviewers that are still users of this tenant. */
export type ApprovalCount = 1 | 2;
export const DEFAULT_APPROVALS: ApprovalCount = 2;

const approvalsSchema = z.object({
  default: z.union([z.literal(1), z.literal(2)]).optional(),
  byCategory: z.record(z.string(), z.union([z.literal(1), z.literal(2)])).optional(),
});
export type ApprovalSettings = z.infer<typeof approvalsSchema>;

export function approvalsFromSettings(settings: unknown): ApprovalSettings {
  const parsed = approvalsSchema.safeParse((settings as { contentApprovals?: unknown } | null)?.contentApprovals);
  return parsed.success ? parsed.data : {};
}

/** How many approvals this category needs. Unknown category → the default. */
export function requiredApprovalsFor(settings: unknown, category: string): ApprovalCount {
  const cfg = approvalsFromSettings(settings);
  return cfg.byCategory?.[category] ?? cfg.default ?? DEFAULT_APPROVALS;
}

/** Reviewers + the approvals this item's category needs, in one read. */
/**
 * Pass the transaction client when calling this inside a transaction: reading
 * on the global client while a row lock is held burns a second pool connection
 * and can deadlock under load (Vanda, #104).
 */
type ReaderClient = Pick<typeof db, "tenant" | "user">;

export async function getApprovalRule(
  tenantId: number,
  category: string,
  client: ReaderClient = db,
): Promise<{ reviewers: number[]; required: ApprovalCount; enoughReviewers: boolean }> {
  const tenant = await client.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const ids = reviewersFromSettings(tenant?.settings);
  const users = ids.length
    ? await client.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true } })
    : [];
  const valid = new Set(users.map((u) => u.id));
  const reviewers = ids.filter((id) => valid.has(id));
  const required = requiredApprovalsFor(tenant?.settings, category);
  return { reviewers, required, enoughReviewers: reviewers.length >= required };
}

export async function getContentReviewers(tenantId: number): Promise<number[]> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const ids = reviewersFromSettings(tenant?.settings);
  if (ids.length === 0) return [];
  const users = await db.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true } });
  const valid = new Set(users.map((u) => u.id));
  return ids.filter((id) => valid.has(id));
}
