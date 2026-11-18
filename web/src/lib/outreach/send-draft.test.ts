// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: { emailDraft: { update: vi.fn().mockResolvedValue({}) }, $transaction: vi.fn(), tenant: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/integrations/mailbox", () => ({ sendViaMailbox: vi.fn() }));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/outreach/template", () => ({ gateDraft: vi.fn() }));
vi.mock("@/lib/campaigns/service", () => ({ advanceOnSent: vi.fn(), campaignSendBlock: vi.fn() }));
vi.mock("@/lib/suppression", () => ({ isAddressSuppressed: vi.fn(), SUPPRESSED_ERROR: "tiltva" }));
vi.mock("@/lib/outreach/recipient", () => ({ resolveDraftRecipient: vi.fn() }));
vi.mock("@/lib/outreach/unsubscribe", () => ({ unsubscribeHeaders: vi.fn() }));
vi.mock("@/lib/outreach/schedule", () => ({ scheduleNextTouch: vi.fn() }));

import type { EmailDraft } from "@prisma/client";
import { db } from "@/lib/db";
import { sendViaMailbox, type MailboxConfig } from "@/lib/integrations/mailbox";
import { deliverClaimedDraft } from "./send-draft";

const row = { id: 7, status: "sending", subject: "S", body: "B", campaign: "c", step: 1, companyId: 1, personId: null, threadKey: null } as unknown as EmailDraft;
const prep = { ok: true as const, to: "a@b.test", text: "t", replyTo: null, headers: {} };
const mailbox = { cfg: {} as MailboxConfig, fromName: "N" };
const lastUpdate = () => vi.mocked(db.emailDraft.update).mock.calls.at(-1)![0] as { data: { status?: string; lastError?: string } };

describe("deliverClaimedDraft, mailbox route", () => {
  beforeEach(() => { vi.mocked(db.emailDraft.update).mockClear(); vi.mocked(sendViaMailbox).mockReset(); });

  it("uncertain send stays in sending, not failed", async () => {
    vi.mocked(sendViaMailbox).mockResolvedValue({ ok: false, auth: false, uncertain: true, error: "x" });
    const r = await deliverClaimedDraft(1, row, prep, { userId: null }, mailbox);
    expect(r).toMatchObject({ ok: false, error: "x" });
    const d = lastUpdate().data;
    expect(d.status === undefined || d.status === "sending").toBe(true);
    expect(d.lastError).toBe("x");
  });

  it("certain failure is marked failed", async () => {
    vi.mocked(sendViaMailbox).mockResolvedValue({ ok: false, auth: false, error: "nem" });
    const r = await deliverClaimedDraft(1, row, prep, { userId: null }, mailbox);
    expect(r.ok).toBe(false);
    expect(lastUpdate().data.status).toBe("failed");
  });

  it("unexpected throw names the mailbox, not Resend", async () => {
    vi.mocked(sendViaMailbox).mockRejectedValue(new Error("boom"));
    const r = await deliverClaimedDraft(1, row, prep, { userId: null }, mailbox);
    expect(lastUpdate().data.lastError).toContain("postafiók");
    expect(lastUpdate().data.lastError).not.toContain("Resend");
    expect(r.ok === false && r.error).toContain("postafiók");
  });
});
