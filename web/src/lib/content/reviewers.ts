import { z } from "zod";
import { db } from "@/lib/db";

/**
 * Who reviews content: `tenants.settings.contentReviewers` = [users.id, users.id]
 * (spec §1 — configured, never hard-coded). EXACTLY two: dual approval is the
 * point (spec decision 2). Anything else — missing, one id, a duplicate, an id
 * whose user row is gone — yields a list shorter than two, and
 * transitions.statusFromReviews never goes live on that (Vanda, PR #99).
 */
export const REQUIRED_REVIEWERS = 2;
/** @deprecated kept for callers; equals REQUIRED_REVIEWERS. */
export const MAX_REVIEWERS = REQUIRED_REVIEWERS;

const reviewersSchema = z.array(z.number().int().positive()).max(REQUIRED_REVIEWERS);

export function reviewersFromSettings(settings: unknown): number[] {
  const parsed = reviewersSchema.safeParse((settings as { contentReviewers?: unknown } | null)?.contentReviewers);
  return parsed.success ? [...new Set(parsed.data)] : [];
}

/** Configured reviewers that are still users of this tenant. */
export async function getContentReviewers(tenantId: number): Promise<number[]> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const ids = reviewersFromSettings(tenant?.settings);
  if (ids.length === 0) return [];
  const users = await db.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true } });
  const valid = new Set(users.map((u) => u.id));
  return ids.filter((id) => valid.has(id));
}
