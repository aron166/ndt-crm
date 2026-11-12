import { describe, it, expect, vi, beforeEach } from "vitest";
import { stopTouchesAfterReply } from "./stop-touches";

// Person B of a company replies in campaign "bp"; person A of the same company sits queued in
// campaign "other". A's queued draft is cancelled with the company-wide stop, and A's member is
// marked, not left queued with nothing to send (Vanda #208-b).
function tx() {
  return {
    emailDraft: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    campaignMember: {
      findMany: vi.fn().mockResolvedValue([{ id: 61, campaignId: 9, stepPosition: 1, state: "queued" }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    campaignEvent: { create: vi.fn().mockResolvedValue({ id: 1 }) },
  };
}
const NOW = new Date("2026-11-12T09:00:00Z");
let t: ReturnType<typeof tx>;
beforeEach(() => { t = tx(); });

describe("stopTouchesAfterReply", () => {
  it("flips the answered touch, cancels the company's queued touches everywhere, marks the other campaigns' open members excluded with an event", async () => {
    const r = await stopTouchesAfterReply(t, 1, 7, { draftId: 70, replyType: null }, { campaign: "bp", leadId: 300, actorUserId: 5, now: NOW });
    expect(r).toEqual({ cancelled: 1, excluded: 1 });
    expect(t.emailDraft.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 70, tenantId: 1, status: "sent" }, data: { status: "replied" } });
    expect(t.emailDraft.updateMany.mock.calls[1][0].where).toEqual({ tenantId: 1, companyId: 7, status: { in: ["draft", "approved", "failed"] } });
    expect(t.campaignMember.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: 1, companyId: 7, state: { in: ["queued", "needs_contact", "needs_email"] }, campaign: { slug: { not: "bp" } },
    });
    expect(t.campaignMember.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 61, tenantId: 1, state: "queued" }, data: { state: "excluded", lastOutcome: "replied_elsewhere", stateChangedAt: NOW },
    });
    expect(t.campaignEvent.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 1, campaignId: 9, memberId: 61, stepPosition: 1, outcome: "replied_elsewhere", leadId: 300, actorUserId: 5, at: NOW,
    });
  });

  it("a member changed meanwhile gets no event", async () => {
    t.campaignMember.updateMany.mockResolvedValue({ count: 0 });
    const r = await stopTouchesAfterReply(t, 1, 7, null, { campaign: "bp", now: NOW });
    expect(r.excluded).toBe(0);
    expect(t.campaignEvent.create).not.toHaveBeenCalled();
  });

  it("no answered draft: nothing flipped, still cancels and marks", async () => {
    await stopTouchesAfterReply(t, 1, 7, null, { campaign: "bp", now: NOW });
    expect(t.emailDraft.updateMany).toHaveBeenCalledTimes(1);
    expect(t.campaignMember.updateMany).toHaveBeenCalledTimes(1);
  });

  it("no other open member: nothing marked", async () => {
    t.campaignMember.findMany.mockResolvedValue([]);
    expect((await stopTouchesAfterReply(t, 1, 7, null, { campaign: "bp", now: NOW })).excluded).toBe(0);
  });
});
