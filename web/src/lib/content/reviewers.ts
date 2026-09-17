import { z } from "zod";
import { db } from "@/lib/db";

/**
 * Who reviews content: `tenants.settings.contentReviewers` = [users.id, …]
 * (spec §1 — configured, never hard-coded). Max 2 (spec: out of scope beyond two).
 * An invalid or missing value means NO reviewers, which means nothing can go live.
 */
export const MAX_REVIEWERS = 2;

const reviewersSchema = z.array(z.number().int().positive()).max(MAX_REVIEWERS);

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
