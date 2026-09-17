import { describe, it, expect, vi, beforeEach } from "vitest";
import { scheduleNextTouch } from "./schedule";

// scheduleNextTouch — pure-ish scheduling logic, driven through a mock tx.

function tx() {
  return {
    emailDraft: {
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

const ROW = { tenantId: 1, companyId: 7, campaign: "cold-email-v0", step: 1 };

function expectLocal8am(d: Date, daysAfter: Date, offsetDays: number) {
  const want = new Date(daysAfter);
  want.setDate(want.getDate() + offsetDays);
  want.setHours(8, 0, 0, 0);
  expect(d.getTime()).toBe(want.getTime());
}

describe("scheduleNextTouch", () => {
  let t: ReturnType<typeof tx>;
  beforeEach(() => {
    t = tx();
  });

  it("step 1 sent: schedules step 2 at +3 days 08:00 local, only draft/approved/failed rows", async () => {
    const sentAt = new Date("2026-09-17T10:15:00");
    const due = await scheduleNextTouch(t as never, ROW, sentAt);
    expect(due).not.toBeNull();
    expectLocal8am(due!, sentAt, 3);
    expect(t.emailDraft.findFirst).not.toHaveBeenCalled();
    expect(t.emailDraft.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 1, companyId: 7, campaign: "cold-email-v0", step: 2,
        status: { in: ["draft", "approved", "failed"] },
      },
      data: { dueAt: due },
    });
  });

  it("step 2 sent: anchors on touch 1's real sentAt, not the given sentAt", async () => {
    const touch1SentAt = new Date("2026-09-01T09:00:00");
    const givenSentAt = new Date("2026-09-05T11:00:00");
    t.emailDraft.findFirst.mockResolvedValue({ sentAt: touch1SentAt });
    const row = { ...ROW, step: 2 };
    const due = await scheduleNextTouch(t as never, row, givenSentAt);
    expect(due).not.toBeNull();
    expectLocal8am(due!, touch1SentAt, 7);
    expect(t.emailDraft.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 1, companyId: 7, campaign: "cold-email-v0", step: 1 },
      select: { sentAt: true },
    });
    expect(t.emailDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ step: 3 }), data: { dueAt: due } }),
    );
  });

  it("step 2 sent but touch 1 has no sentAt: falls back to the given sentAt", async () => {
    const givenSentAt = new Date("2026-09-05T11:00:00");
    t.emailDraft.findFirst.mockResolvedValue({ sentAt: null });
    const row = { ...ROW, step: 2 };
    const due = await scheduleNextTouch(t as never, row, givenSentAt);
    expect(due).not.toBeNull();
    expectLocal8am(due!, givenSentAt, 7);
  });

  it("step 4 sent: returns null and updates nothing", async () => {
    const row = { ...ROW, step: 4 };
    const due = await scheduleNextTouch(t as never, row, new Date());
    expect(due).toBeNull();
    expect(t.emailDraft.updateMany).not.toHaveBeenCalled();
  });
});
