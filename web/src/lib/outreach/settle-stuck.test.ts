// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scheduleNextTouch } from "@/lib/outreach/schedule";
import { advanceOnSent } from "@/lib/campaigns/service";
import { settleStuckDraft } from "./send-draft";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/outreach/schedule", () => ({ scheduleNextTouch: vi.fn() }));
vi.mock("@/lib/campaigns/service", () => ({ campaignSendBlock: vi.fn(), advanceOnSent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/integrations/mailbox", () => ({ sendViaMailbox: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { emailDraft: { findFirst: vi.fn(), updateMany: vi.fn() }, $transaction: vi.fn() },
}));

const m = db as unknown as { emailDraft: Record<string, ReturnType<typeof vi.fn>>; $transaction: ReturnType<typeof vi.fn> };
const row = { id: 7, tenantId: 1, status: "sending", campaign: "bp", step: 1, companyId: 4, personId: 5, threadKey: null, sentVia: "mailbox" };
const now = new Date("2026-11-18T12:00:00Z");
const txUpdateMany = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  m.emailDraft.findFirst.mockResolvedValue(row);
  m.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ emailDraft: { updateMany: txUpdateMany } }));
});

describe("settleStuckDraft", () => {
  it("not_sent returns the draft to approved, guarded by tenant, status and age", async () => {
    m.emailDraft.updateMany.mockResolvedValue({ count: 1 });
    expect(await settleStuckDraft(1, 7, "not_sent", { userId: 2 }, now)).toEqual({ ok: true });
    const arg = m.emailDraft.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: 7, tenantId: 1, status: "sending", updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } });
    expect(arg.data).toMatchObject({ status: "approved", sentVia: null });
    expect(audit).toHaveBeenCalled();
  });
  it("sent records the send, keeps sentVia, schedules the next touch and advances the campaign", async () => {
    txUpdateMany.mockResolvedValue({ count: 1 });
    expect(await settleStuckDraft(1, 7, "sent", { userId: 2 }, now)).toEqual({ ok: true });
    const data = txUpdateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "sent", sentAt: now, sentVia: "mailbox" });
    expect(scheduleNextTouch).toHaveBeenCalled();
    expect(advanceOnSent).toHaveBeenCalled();
    expect(audit).toHaveBeenCalled();
  });
  it("count 0 (in flight or not sending): not ok, no audit, no advance", async () => {
    m.emailDraft.updateMany.mockResolvedValue({ count: 0 });
    txUpdateMany.mockResolvedValue({ count: 0 });
    for (const o of ["not_sent", "sent"] as const) {
      expect((await settleStuckDraft(1, 7, o, { userId: 2 }, now)).ok).toBe(false);
    }
    expect(audit).not.toHaveBeenCalled();
    expect(advanceOnSent).not.toHaveBeenCalled();
  });
  it("a row of another tenant is not found", async () => {
    m.emailDraft.findFirst.mockResolvedValue(null);
    expect((await settleStuckDraft(2, 7, "sent", { userId: 2 }, now)).ok).toBe(false);
    expect(m.emailDraft.updateMany).not.toHaveBeenCalled();
  });
});
