import type { Prisma } from "@prisma/client";

type DraftTx = {
  emailDraft: { updateMany(args: Prisma.EmailDraftUpdateManyArgs): Promise<{ count: number }> };
};

/**
 * A reply stops the outreach to that company (C2, 2026-11-12), the ONE rule for every reply
 * path (/outreach "Válasz jött", IMAP intake via ingestLead, and the campaign hub):
 * the answered touch, if known, becomes `replied` (only a SENT one); every queued touch to the
 * company in EVERY campaign is cancelled (`failed` too: it is sendable by hand). Idempotent:
 * a second run finds nothing to change. Runs inside the caller's transaction.
 */
export async function stopTouchesAfterReply(
  tx: DraftTx,
  tenantId: number,
  companyId: number,
  answered: { draftId: number; replyType: string | null } | null,
): Promise<number> {
  if (answered) {
    await tx.emailDraft.updateMany({
      where: { id: answered.draftId, tenantId, status: "sent" },
      data: { status: "replied", repliedAt: new Date(), replyType: answered.replyType },
    });
  }
  const { count } = await tx.emailDraft.updateMany({
    where: { tenantId, companyId, status: { in: ["draft", "approved", "failed"] } },
    data: { status: "cancelled" },
  });
  return count;
}
