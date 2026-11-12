import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { getDraftBody, sendDraft } from "./email-drafts";
import { sendEmail } from "@/lib/integrations/resend";
import { resolveDraftRecipient } from "@/lib/outreach/recipient";
import { SUPPRESSED_ERROR } from "@/lib/suppression";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn().mockResolvedValue({ userId: 2 }), isCrmUser: vi.fn().mockResolvedValue(true), NOT_A_CRM_USER: "x" }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    emailDraft: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ emailDraft: { update: vi.fn() } })),
    tenant: { findUnique: vi.fn() },
    contact: { findFirst: vi.fn() },
    suppression: { findMany: vi.fn() },
    contentItem: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("@/lib/outreach/template", () => ({ gateDraft: vi.fn().mockResolvedValue({ ok: true }), gateOn: vi.fn(), templatesForCampaigns: vi.fn() }));
vi.mock("@/lib/campaigns/service", () => ({ campaignSendBlock: vi.fn().mockResolvedValue(null), advanceOnSent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/outreach/recipient", async (orig) => { const a = await orig<typeof import("@/lib/outreach/recipient")>(); return { ...a, resolveDraftRecipient: vi.fn(a.resolveDraftRecipient) }; });
vi.mock("@/lib/outreach/schedule", () => ({ scheduleNextTouch: vi.fn() }));

const m = db as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

describe("getDraftBody", () => {
  it("refuses when toEmail is null and the resolved person email is suppressed", async () => {
    m.emailDraft.findFirst.mockResolvedValue({ body: "b", campaign: "c", step: 1, toEmail: null, personId: 5, companyId: 10 });
    m.contact.findFirst.mockResolvedValue({ email: null, person: { email: "nem@tilos.hu" } });
    m.suppression.findMany.mockResolvedValue([{ email: null, domain: "tilos.hu" }]);
    expect(await getDraftBody(1)).toEqual({ ok: false, error: SUPPRESSED_ERROR });
  });
});

describe("sendDraft unsubscribe headers", () => {
  const send = sendEmail as unknown as ReturnType<typeof vi.fn>;
  const row = { id: 12, status: "approved", campaign: "bp", step: 1, subject: "S", body: "B", companyId: 4, personId: 5, threadKey: null };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    m.emailDraft.findFirst.mockResolvedValue(row);
    m.emailDraft.updateMany.mockResolvedValue({ count: 1 });
    m.suppression.findMany.mockResolvedValue([]);
    m.tenant.findUnique.mockResolvedValue({ settings: { outreachFooter: "Leiratkozás: válaszoljon" } });
    send.mockResolvedValue({ ok: true, id: "re_1" });
    (resolveDraftRecipient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("Kinga@Ceg.hu");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("passes headers and the idempotency key, and stores toEmail", async () => {
    const txUpdate = vi.fn();
    (db as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn({ emailDraft: { update: txUpdate } }));
    expect(await sendDraft(12)).toEqual({ ok: true });
    const arg = send.mock.calls[0][0];
    expect(arg.idempotencyKey).toMatch(/^draft-12-[0-9a-f]{16}$/);
    expect(arg.headers["List-Unsubscribe"]).toMatch(/^<.*\/api\/outreach\/unsubscribe\?d=.+&s=.+>$/);
    expect(arg.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(txUpdate.mock.calls[0][0].data.toEmail).toBe("Kinga@Ceg.hu");
  });
  it("an edited retry gets a different idempotency key (Vanda #196-1)", async () => {
    (db as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ emailDraft: { update: vi.fn() } }));
    await sendDraft(12);
    m.emailDraft.findFirst.mockResolvedValue({ ...row, body: "B edited" });
    await sendDraft(12);
    expect(send.mock.calls[0][0].idempotencyKey).not.toBe(send.mock.calls[1][0].idempotencyKey);
  });
  it("refuses before the claim when ENCRYPTION_KEY is missing", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    const r = await sendDraft(12);
    expect(r.ok).toBe(false);
    expect(m.emailDraft.updateMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
