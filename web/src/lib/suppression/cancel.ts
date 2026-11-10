import "server-only";
import { db } from "@/lib/db";
import { audit, type AuditOptions } from "@/lib/audit";
import { resolveDraftRecipient } from "@/lib/outreach/recipient";
import { isSuppressed } from "./index";

/**
 * A new suppression entry: queued drafts to it must not go out, so cancel them now.
 * Shared by the settings action and POST /api/suppressions. Returns how many it cancelled.
 */
export async function cancelQueuedDraftsFor(
  tenantId: number,
  target: { email: string | null; domain: string | null },
  auditOpts: AuditOptions = {},
): Promise<number> {
  const queued = await db.emailDraft.findMany({
    where: { tenantId, status: { in: ["draft", "approved", "failed"] } },
    select: { id: true, status: true, toEmail: true, personId: true, companyId: true },
  });
  const set = { emails: new Set(target.email ? [target.email] : []), domains: new Set(target.domain ? [target.domain] : []) };
  let cancelled = 0;
  for (const d of queued) {
    // ponytail: one lookup per row; batch when the queue is hundreds
    if (!isSuppressed(await resolveDraftRecipient(tenantId, d), set)) continue;
    const res = await db.emailDraft.updateMany({
      where: { id: d.id, tenantId, status: d.status },
      data: { status: "cancelled" },
    });
    if (res.count === 0) continue;
    cancelled += 1;
    await audit("email_draft", d.id, "update", { status: d.status }, { status: "cancelled", reason: "suppressed" }, { tenantId, ...auditOpts });
  }
  return cancelled;
}
