import type { Prisma } from "@prisma/client";

type StopTx = {
  emailDraft: { updateMany(args: Prisma.EmailDraftUpdateManyArgs): Promise<{ count: number }> };
  /** Optional only for narrow test fakes; the real transaction client always has them. */
  campaignMember?: {
    findMany(args: Prisma.CampaignMemberFindManyArgs): Promise<{ id: number; campaignId: number; stepPosition: number; state: string }[]>;
    updateMany(args: Prisma.CampaignMemberUpdateManyArgs): Promise<{ count: number }>;
  };
  campaignEvent?: { create(args: Prisma.CampaignEventCreateArgs): Promise<unknown> };
};

const OPEN = ["queued", "needs_contact", "needs_email"];

/**
 * A reply stops the outreach to that company (C2, 2026-11-12), the ONE rule for every reply
 * path (/outreach "Válasz jött", IMAP intake via ingestLead, and the campaign hub):
 * - the answered touch, if known, becomes `replied` (only a SENT one);
 * - every queued touch to the company in EVERY campaign is cancelled (`failed` too: it is
 *   sendable by hand);
 * - the company's open members of OTHER campaigns would sit queued with nothing to send, so
 *   they become `excluded` ("kizárva" in the hub) with lastOutcome and a campaign event
 *   `replied_elsewhere`. The answered campaign's own member is the caller's business.
 * Idempotent: a second run finds nothing to change. Runs inside the caller's transaction.
 */
export async function stopTouchesAfterReply(
  tx: StopTx,
  tenantId: number,
  companyId: number,
  answered: { draftId: number; replyType: string | null } | null,
  ctx: { campaign: string | null; leadId?: number | null; actorUserId?: number | null; actorAgentId?: string | null; now?: Date },
): Promise<{ cancelled: number; excluded: number }> {
  const now = ctx.now ?? new Date();
  if (answered) {
    await tx.emailDraft.updateMany({
      where: { id: answered.draftId, tenantId, status: "sent" },
      data: { status: "replied", repliedAt: now, replyType: answered.replyType },
    });
  }
  const { count: cancelled } = await tx.emailDraft.updateMany({
    where: { tenantId, companyId, status: { in: ["draft", "approved", "failed"] } },
    data: { status: "cancelled" },
  });

  let excluded = 0;
  if (tx.campaignMember && tx.campaignEvent) {
    const others = await tx.campaignMember.findMany({
      where: { tenantId, companyId, state: { in: OPEN }, ...(ctx.campaign ? { campaign: { slug: { not: ctx.campaign } } } : {}) },
      select: { id: true, campaignId: true, stepPosition: true, state: true },
    });
    for (const m of others) {
      const { count } = await tx.campaignMember.updateMany({
        where: { id: m.id, tenantId, state: m.state },
        data: { state: "excluded", lastOutcome: "replied_elsewhere", stateChangedAt: now },
      });
      if (count === 0) continue;
      excluded += 1;
      await tx.campaignEvent.create({
        data: {
          tenantId, campaignId: m.campaignId, memberId: m.id, stepPosition: m.stepPosition, outcome: "replied_elsewhere",
          leadId: ctx.leadId ?? null, actorUserId: ctx.actorUserId ?? null, actorAgentId: ctx.actorAgentId ?? null, at: now,
        },
      });
    }
  }
  return { cancelled, excluded };
}
