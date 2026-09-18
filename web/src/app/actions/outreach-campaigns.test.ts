import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { audit } from "@/lib/audit";
import { runAutomations } from "@/lib/automations/engine";
import { ingestLead } from "@/lib/leads/ingest";
import { threadKeyFor } from "@/lib/outreach/drafts";
import {
  listSenders, setCampaignTarget, markDraftSentManually, markDraftReplied,
  getDueTouches, listCampaignKeys, getCampaignStats,
} from "./outreach-campaigns";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn(), NOT_A_CRM_USER: "NOT_A_CRM_USER" }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/automations/engine", () => ({ runAutomations: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/leads/ingest", () => ({ ingestLead: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findMany: vi.fn() },
    emailDraft: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    tenant: { findUnique: vi.fn() },
    lead: { findFirst: vi.fn(), findMany: vi.fn() },
    interaction: { findMany: vi.fn() },
    company: { updateMany: vi.fn() },
    // §6b template gate: no slot configured means the gate passes.
    contentItem: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
  },
}));

type M = ReturnType<typeof vi.fn>;
const mockDb = db as unknown as {
  user: { findMany: M };
  emailDraft: { findFirst: M; findMany: M; updateMany: M };
  tenant: { findUnique: M };
  lead: { findFirst: M; findMany: M };
  interaction: { findMany: M };
  company: { updateMany: M };
  contentItem: { findFirst: M };
  $transaction: M;
};
const mockGetActor = getActor as unknown as M;
const mockIngestLead = ingestLead as unknown as M;
const mockRunAutomations = runAutomations as unknown as M;
const mockAudit = audit as unknown as M;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActor.mockResolvedValue({ userId: 2, email: "u@x.com" });
  // Default: no template configured for the step, so the §6b gate passes.
  mockDb.contentItem.findFirst.mockResolvedValue(null);
});

describe("every action rejects a signed-in-but-not-a-CRM-user actor", () => {
  it("touches no db write and returns the not-a-user error / empty result", async () => {
    mockGetActor.mockResolvedValue({ userId: null, email: "outsider@x.com" });

    expect(await listSenders()).toEqual([]);
    expect(await setCampaignTarget({ campaign: "c1", companyId: 1 })).toEqual({ ok: false, error: NOT_A_CRM_USER });
    expect(await markDraftSentManually({ draftId: 1 })).toEqual({ ok: false, error: NOT_A_CRM_USER });
    expect(await markDraftReplied({ draftId: 1, replyType: "interested" })).toEqual({ ok: false, error: NOT_A_CRM_USER });
    expect(await getDueTouches()).toEqual([]);
    expect(await listCampaignKeys()).toEqual([]);
    expect(await getCampaignStats({ campaign: "c1" })).toEqual({ ok: false, error: NOT_A_CRM_USER });

    expect(mockDb.user.findMany).not.toHaveBeenCalled();
    expect(mockDb.emailDraft.findFirst).not.toHaveBeenCalled();
    expect(mockDb.emailDraft.findMany).not.toHaveBeenCalled();
    expect(mockDb.emailDraft.updateMany).not.toHaveBeenCalled();
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});

describe("markDraftSentManually", () => {
  const ROW = {
    id: 1, tenantId: 1, status: "approved", companyId: 10, personId: 5,
    senderUserId: null, campaign: "cold-email-v0", step: 1, subject: "Subj",
    threadKey: null,
  };

  function txWith(claimCount: number) {
    return {
      emailDraft: { updateMany: vi.fn().mockResolvedValue({ count: claimCount }), findFirst: vi.fn() },
      interaction: { create: vi.fn().mockResolvedValue({ id: 900 }) },
      company: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
  }

  it("a draft still in status 'draft' is refused, no transaction runs", async () => {
    mockDb.emailDraft.findFirst.mockResolvedValue({ ...ROW, status: "draft" });
    const res = await markDraftSentManually({ draftId: 1 });
    expect(res).toEqual({ ok: false, error: "Előbb hagyd jóvá, vagy ez az érintés már elment" });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("§6b: a step whose template is not live is refused, no transaction runs", async () => {
    mockDb.emailDraft.findFirst.mockResolvedValue({ ...ROW, status: "approved" });
    mockDb.contentItem.findFirst.mockResolvedValue({
      id: 7, title: "1. érintés", status: "in_review", liveVersionId: null,
    });
    const res = await markDraftSentManually({ draftId: 1 });
    expect(res).toMatchObject({ ok: false });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("§6b: a live template lets the send through", async () => {
    mockDb.emailDraft.findFirst.mockResolvedValue({ ...ROW, status: "approved" });
    mockDb.contentItem.findFirst.mockResolvedValue({
      id: 7, title: "1. érintés", status: "live", liveVersionId: 33,
    });
    mockDb.tenant.findUnique.mockResolvedValue({ settings: { outreachFooter: "Leiratkozás: …" } });
    mockDb.lead.findFirst.mockResolvedValue(null);
    const tx = txWith(1);
    mockDb.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
    const res = await markDraftSentManually({ draftId: 1 });
    expect(res).toMatchObject({ ok: true });
  });

  it("missing outreach footer in tenant settings is refused, no transaction runs", async () => {
    mockDb.emailDraft.findFirst.mockResolvedValue(ROW);
    mockDb.tenant.findUnique.mockResolvedValue({ settings: {} });
    const res = await markDraftSentManually({ draftId: 1 });
    expect(res).toEqual({ ok: false, error: "Hiányzik a leiratkozási lábléc: töltsd ki a beállításokban" });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("happy path: claims the row, logs the interaction, returns ok", async () => {
    mockDb.emailDraft.findFirst.mockResolvedValue(ROW);
    mockDb.tenant.findUnique.mockResolvedValue({ settings: { outreachFooter: "unsubscribe here" } });
    mockDb.lead.findFirst.mockResolvedValue({ id: 50 });
    const tx = txWith(1);
    mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const res = await markDraftSentManually({ draftId: 1 });

    expect(tx.emailDraft.updateMany).toHaveBeenCalledWith({
      where: { id: 1, tenantId: 1, status: { in: ["approved", "failed"] } },
      data: expect.objectContaining({ status: "sent", sentVia: "manual" }),
    });
    expect(tx.interaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 1, companyId: 10, personId: 5, leadId: 50, userId: 2,
        type: "email", direction: "outbound", outcome: "sent", campaign: "cold-email-v0",
      }),
    });
    expect(res.ok).toBe(true);
  });

  it("claim count 0 (double click) is refused, no interaction created", async () => {
    mockDb.emailDraft.findFirst.mockResolvedValue(ROW);
    mockDb.tenant.findUnique.mockResolvedValue({ settings: { outreachFooter: "unsubscribe here" } });
    mockDb.lead.findFirst.mockResolvedValue({ id: 50 });
    const tx = txWith(0);
    mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const res = await markDraftSentManually({ draftId: 1 });
    expect(res).toEqual({ ok: false, error: "Ez az érintés már el lett könyvelve" });
    expect(tx.interaction.create).not.toHaveBeenCalled();
  });
});

describe("markDraftReplied", () => {
  const ROW = {
    id: 1, tenantId: 1, companyId: 10, campaign: "cold-email-v0", status: "sent",
    toEmail: "prospect@x.com", threadKey: null, externalThreadId: null,
    company: { name: "Acme Kft." },
    person: { firstName: "Anna", lastName: "Kiss", email: null, phone: null },
  };

  it("a draft not in status 'sent' is refused", async () => {
    mockDb.emailDraft.findFirst.mockResolvedValue({ ...ROW, status: "draft" });
    const res = await markDraftReplied({ draftId: 1, replyType: "interested" });
    expect(res).toEqual({ ok: false, error: "Csak elküldött érintésre jöhet válasz" });
    expect(mockIngestLead).not.toHaveBeenCalled();
  });

  it("another draft of the same company+campaign already 'replied' is refused, ingestLead not called", async () => {
    mockDb.emailDraft.findFirst
      .mockResolvedValueOnce(ROW)
      .mockResolvedValueOnce({ id: 2 });
    const res = await markDraftReplied({ draftId: 1, replyType: "interested" });
    expect(res).toEqual({ ok: false, error: "Erre a megkeresésre már rögzítettünk választ" });
    expect(mockIngestLead).not.toHaveBeenCalled();
  });

  it("happy path: ingestLead called with the draft ctx and manual thread key, runAutomations called once", async () => {
    mockDb.emailDraft.findFirst
      .mockResolvedValueOnce(ROW)
      .mockResolvedValueOnce(null);
    mockIngestLead.mockResolvedValue({ leadId: 77, companyId: 10, personId: 5, deduped: false, tier: "B" });
    const tx = {};
    mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const res = await markDraftReplied({ draftId: 1, replyType: "interested" });

    expect(mockIngestLead).toHaveBeenCalledTimes(1);
    const [intakeData, ctx, passedTx] = mockIngestLead.mock.calls[0];
    expect(ctx).toEqual({ tenantId: 1, appSlug: "crm-ui", draftId: 1 });
    expect(passedTx).toBe(tx);
    const draftKey = threadKeyFor("cold-email-v0", 10);
    expect(intakeData.thread_key).toBe(`manual:${draftKey}`.toLowerCase());
    expect(mockRunAutomations).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ok: true, leadId: 77, deduped: false });
  });

  it("ingestLead returning deduped:true skips runAutomations and audit", async () => {
    mockDb.emailDraft.findFirst
      .mockResolvedValueOnce(ROW)
      .mockResolvedValueOnce(null);
    mockIngestLead.mockResolvedValue({ leadId: 77, companyId: 10, personId: 5, deduped: true, tier: null });
    mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));

    const res = await markDraftReplied({ draftId: 1, replyType: "interested" });
    expect(res).toEqual({ ok: true, leadId: 77, deduped: true });
    expect(mockRunAutomations).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("getCampaignStats", () => {
  it("filtering by senderUserId scopes lead/interaction to that sender's companies, no assignedToId/userId clause", async () => {
    mockDb.emailDraft.findMany.mockResolvedValue([
      { companyId: 10, step: 1, status: "sent", sentAt: new Date(), replyType: null, senderUserId: 2, wave: 1 },
      { companyId: 20, step: 1, status: "sent", sentAt: new Date(), replyType: null, senderUserId: 3, wave: 1 },
    ]);
    mockDb.lead.findMany.mockResolvedValue([]);
    mockDb.interaction.findMany.mockResolvedValue([]);

    const res = await getCampaignStats({ campaign: "c1", senderUserId: 2 });
    expect(mockDb.lead.findMany).toHaveBeenCalledWith({
      where: { tenantId: 1, campaign: "c1", companyId: { in: [10] } },
      select: { tier: true, outcome: true },
    });
    expect(mockDb.interaction.findMany).toHaveBeenCalledWith({
      where: { tenantId: 1, campaign: "c1", type: { not: "email" }, companyId: { in: [10] } },
      select: { type: true, outcome: true },
    });
    expect((res as { targetsTotal: number }).targetsTotal).toBe(1);
  });

  it("no filter: leaves off the companyId clause entirely", async () => {
    mockDb.emailDraft.findMany.mockResolvedValue([
      { companyId: 10, step: 1, status: "sent", sentAt: new Date(), replyType: null, senderUserId: 2, wave: 1 },
      { companyId: 20, step: 1, status: "sent", sentAt: new Date(), replyType: null, senderUserId: 3, wave: 1 },
    ]);
    mockDb.lead.findMany.mockResolvedValue([]);
    mockDb.interaction.findMany.mockResolvedValue([]);

    await getCampaignStats({ campaign: "c1" });
    expect(mockDb.lead.findMany).toHaveBeenCalledWith({
      where: { tenantId: 1, campaign: "c1" },
      select: { tier: true, outcome: true },
    });
  });

  it("zero drafts + senderUserId filter: falls back to lead.assignedToId / interaction.userId", async () => {
    mockDb.emailDraft.findMany.mockResolvedValue([]);
    mockDb.lead.findMany.mockResolvedValue([]);
    mockDb.interaction.findMany.mockResolvedValue([]);

    await getCampaignStats({ campaign: "c2", senderUserId: 3 });
    expect(mockDb.lead.findMany).toHaveBeenCalledWith({
      where: { tenantId: 1, campaign: "c2", assignedToId: 3 },
      select: { tier: true, outcome: true },
    });
    expect(mockDb.interaction.findMany).toHaveBeenCalledWith({
      where: { tenantId: 1, campaign: "c2", type: { not: "email" }, userId: 3 },
      select: { type: true, outcome: true },
    });
  });

  it("zero drafts + wave filter (no sender): scopes to an impossible id, since wave has no phone-call meaning", async () => {
    mockDb.emailDraft.findMany.mockResolvedValue([]);
    mockDb.lead.findMany.mockResolvedValue([]);
    mockDb.interaction.findMany.mockResolvedValue([]);

    await getCampaignStats({ campaign: "c3", wave: 1 });
    expect(mockDb.lead.findMany).toHaveBeenCalledWith({
      where: { tenantId: 1, campaign: "c3", id: -1 },
      select: { tier: true, outcome: true },
    });
    expect(mockDb.interaction.findMany).toHaveBeenCalledWith({
      where: { tenantId: 1, campaign: "c3", type: { not: "email" }, id: -1 },
      select: { type: true, outcome: true },
    });
  });
});

describe("getDueTouches", () => {
  it("excludes a row whose company+campaign already has a replied draft", async () => {
    mockDb.emailDraft.findMany
      .mockResolvedValueOnce([
        {
          id: 1, companyId: 1, campaign: "c1", wave: 1, step: 1, subject: "s",
          status: "draft", dueAt: new Date(), senderUserId: 2, toEmail: "a@b.com",
          company: { name: "A" }, person: null,
        },
      ])
      .mockResolvedValueOnce([{ companyId: 1, campaign: "c1" }]);

    const res = await getDueTouches();
    expect(res).toEqual([]);
  });
});
