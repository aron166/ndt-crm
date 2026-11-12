import { describe, it, expect, vi, beforeEach } from "vitest";
import { stopTouchesAfterReply } from "./stop-touches";

// A reply stops the company's outreach: the answered touch is replied, queued touches in every
// campaign are cancelled. Campaign members are NOT touched here (other campaigns' members keep
// their state; making them visible is an open owner decision, see PR #208).
function tx() {
  return {
    emailDraft: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    campaignMember: { findMany: vi.fn(), updateMany: vi.fn() },
    campaignEvent: { create: vi.fn() },
  };
}
let t: ReturnType<typeof tx>;
beforeEach(() => { t = tx(); });

describe("stopTouchesAfterReply", () => {
  it("flips the answered touch and cancels the company's queued touches in every campaign", async () => {
    expect(await stopTouchesAfterReply(t, 1, 7, { draftId: 70, replyType: null })).toBe(1);
    expect(t.emailDraft.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 70, tenantId: 1, status: "sent" }, data: { status: "replied", replyType: null } });
    expect(t.emailDraft.updateMany.mock.calls[1][0].where).toEqual({ tenantId: 1, companyId: 7, status: { in: ["draft", "approved", "failed"] } });
  });

  it("never touches campaign members or writes campaign events", async () => {
    await stopTouchesAfterReply(t, 1, 7, { draftId: 70, replyType: "no" });
    expect(t.campaignMember.findMany).not.toHaveBeenCalled();
    expect(t.campaignMember.updateMany).not.toHaveBeenCalled();
    expect(t.campaignEvent.create).not.toHaveBeenCalled();
  });

  it("no answered draft: nothing flipped, the queued touches are still cancelled", async () => {
    await stopTouchesAfterReply(t, 1, 7, null);
    expect(t.emailDraft.updateMany).toHaveBeenCalledTimes(1);
  });
});
