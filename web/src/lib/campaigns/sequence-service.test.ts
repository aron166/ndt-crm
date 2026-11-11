// Item 4, service side: edits mid-run, audience by stage, the replied flag, the e-mail step's drafts (never sent here).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/enrichment/recompute", () => ({ recomputeCloseness: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/automations/engine", () => ({ runAutomations: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/leads/lifecycle-sweep", () => ({ startLeadLifecycle: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/leads/service", () => ({ changeLeadStatus: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("@/lib/booking/queries", () => ({ resolveDemoHost: vi.fn() }));
vi.mock("@/lib/leads/queries", () => ({ getLeadStatuses: vi.fn().mockResolvedValue(["new", "contacting", "qualified", "won", "lost"].map((key) => ({ key, label: key }))) }));
vi.mock("@/lib/suppression", () => ({ loadSuppressionSet: vi.fn().mockResolvedValue({ emails: new Set(), domains: new Set() }) }));
vi.mock("@/lib/content/service", () => ({ createItem: vi.fn() }));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn(() => { throw new Error("never send from the campaign engine"); }) }));
vi.mock("@/lib/db", () => {
  const m = () => vi.fn();
  return { db: {
    campaign: { findFirst: m(), update: m() },
    campaignStep: { deleteMany: m(), createMany: m() },
    campaignMember: { findFirst: m(), findMany: m(), updateMany: m(), createMany: m() },
    campaignEvent: { findFirst: m(), create: m() },
    contact: { findFirst: m() }, lead: { findFirst: m(), findMany: m(), create: m() }, interaction: { create: m(), updateMany: m() },
    contentItem: { findMany: m() }, emailDraft: { findMany: m(), createMany: m() }, user: { findFirst: m() }, task: { findMany: m(), updateMany: m() },
    suppression: { upsert: m() }, company: { updateMany: m() }, leadStatusHistory: { create: m() },
    $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn().mockResolvedValue(1), $transaction: vi.fn(),
  } };
});

import { setSteps, updateCampaign, recordOutcome, loadLeadAudience, draftEmailStep, advanceOnSent } from "./service";

type M = ReturnType<typeof vi.fn>;
const d = db as unknown as Record<string, Record<string, M>> & { $transaction: M };
const SESSION = { tenantId: 1, userId: 5 };
const NOW = new Date("2026-11-13T09:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  d.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  d.user.findFirst.mockResolvedValue({ role: "admin" });
});

describe("edits", () => {
  it("an edit mid-run sends the campaign to draft and closes members past the new end", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "running", dailyCap: 15, kind: "sequence", audience: null });
    expect(await setSteps(SESSION, "bp", [{ channel: "email" }, { channel: "call", wait_days: 2 }])).toMatchObject({ ok: true, status: "draft" });
    expect(d.campaignMember.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ campaignId: 3, stepPosition: { gt: 2 } }), data: expect.objectContaining({ state: "done" }),
    }));
  });
  it("leads by stage may open with a call; prospects may not", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", dailyCap: 15, kind: "sequence", audience: { source: "leads_by_stage", stages: ["contacting"] } });
    expect(await setSteps(SESSION, "bp", [{ channel: "call" }, { channel: "email", wait_days: 5 }])).toMatchObject({ ok: true });
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", dailyCap: 15, kind: "sequence", audience: null });
    expect(await setSteps(SESSION, "bp", [{ channel: "call" }, { channel: "email" }])).toMatchObject({ status: 400 });
  });
  it("leads by stage needs at least one known open stage", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", dailyCap: 15, briefProposal: null, outboundAutomations: false, audience: null });
    expect(await updateCampaign(SESSION, "bp", { audience: { source: "leads_by_stage", stages: ["won"] } })).toMatchObject({ status: 400 });
    expect(await updateCampaign(SESSION, "bp", { audience: { source: "leads_by_stage", stages: [] } })).toMatchObject({ status: 400 });
  });
  it("changing the audience of a running campaign needs a new approval", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "running", dailyCap: 15, briefProposal: null, outboundAutomations: false, audience: null });
    expect(await updateCampaign(SESSION, "bp", { audience: { source: "leads_by_stage", stages: ["qualified"] } })).toMatchObject({ ok: true, status: "draft" });
    expect(d.campaign.update.mock.calls[0][0].data).toMatchObject({ status: "draft", audience: { source: "leads_by_stage", stages: ["qualified"] } });
  });
});

describe("the replied flag comes from the member's campaign events", () => {
  it("an e-mail sent after a reply skips the no-reply steps", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, slug: "bp", status: "running", ownerUserId: 9, outboundAutomations: false, audience: null, steps: [
      { position: 1, channel: "email", waitDays: 0, audienceRule: "all" },
      { position: 2, channel: "email", waitDays: 2, audienceRule: "no_reply" },
      { position: 3, channel: "email", waitDays: 1, audienceRule: "replied" },
    ] });
    d.campaignMember.findFirst.mockResolvedValue({ id: 44, state: "queued", stepPosition: 1, attempts: 0, companyId: 7, personId: 8, company: { name: "P Kft.", pipelineStatus: "1" }, person: { email: "a@p.example.test", phone: null, firstName: "A", lastName: "B" } });
    d.campaignEvent.findFirst.mockResolvedValue({ id: 1 });
    d.campaignMember.updateMany.mockResolvedValue({ count: 1 });
    d.contact.findFirst.mockResolvedValue(null);
    expect(await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "email_sent" }, NOW)).toMatchObject({ ok: true, member: { step_position: 3 } });
  });
});

describe("leads by stage (retargeting, nurture)", () => {
  it("loads open leads in the chosen stages as members on the first step; a dry run writes nothing", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", kind: "sequence", audience: { source: "leads_by_stage", stages: ["contacting"] },
      steps: [{ position: 1, channel: "call", waitDays: 0, audienceRule: "all" }] });
    d.lead.findMany.mockResolvedValue([
      { id: 30, companyId: 7, contact: { personId: 8, phone: "+361", email: null, person: { phone: null, email: null } }, company: { city: "Budapest" } },
      { id: 31, companyId: 9, contact: null, company: { city: null } },
    ]);
    d.campaignMember.findMany.mockResolvedValue([{ companyId: 9 }]);
    const dry = await loadLeadAudience(SESSION, "bp", { dry_run: true, batch: "lb1" });
    expect(dry).toMatchObject({ ok: true, dry_run: true, summary: { add: 1, already_member: 1 } });
    expect(d.campaignMember.createMany).not.toHaveBeenCalled();
    await loadLeadAudience(SESSION, "bp", { dry_run: false, batch: "lb1" });
    expect(d.campaignMember.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ companyId: 7, leadId: 30, personId: 8, stepPosition: 1, state: "queued", importBatch: "lb1" })]);
  });
  it("a prospect-list campaign has no lead loader", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", kind: "sequence", audience: null, steps: [] });
    expect(await loadLeadAudience(SESSION, "bp", { dry_run: true, batch: "lb1" })).toMatchObject({ status: 409 });
  });
});

describe("an e-mail step produces drafts for the gated sender, never a send", () => {
  it("drafts the step's live asset for due members with an address, once; members without an address or asset are counted", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, slug: "bp", status: "running", dailyCap: 15, startsOn: null, endsOn: null,
      steps: [{ position: 1, channel: "email", waitDays: 0, contentItemId: 50 }, { position: 2, channel: "email", waitDays: 2, contentItemId: null }] });
    d.campaignMember.findMany.mockResolvedValue([
      { id: 1, companyId: 7, personId: 8, stepPosition: 1, nextEligibleOn: null, person: { email: "a@p.example.test" } },
      { id: 2, companyId: 9, personId: null, stepPosition: 1, nextEligibleOn: null, person: null },
      { id: 3, companyId: 11, personId: 12, stepPosition: 2, nextEligibleOn: null, person: { email: "c@p.example.test" } },
      { id: 4, companyId: 13, personId: 14, stepPosition: 1, nextEligibleOn: new Date("2026-11-20T00:00:00Z"), person: { email: "d@p.example.test" } },
    ]);
    d.contentItem.findMany.mockResolvedValue([{ id: 50, title: "Első levél", body: "Tisztelt ..." }]);
    d.emailDraft.findMany.mockResolvedValue([]);
    d.emailDraft.createMany.mockResolvedValue({ count: 1 });
    const r = await draftEmailStep(SESSION, "bp", NOW);
    expect(r).toMatchObject({ ok: true, drafted: 1, noAddress: 1, noAsset: 1 });
    expect(d.emailDraft.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ companyId: 7, personId: 8, campaign: "bp", step: 1, subject: "Első levél", body: "Tisztelt ...", toEmail: "a@p.example.test", status: "draft" })]);
  });
  it("a draft campaign drafts nothing (approval first)", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, slug: "bp", status: "draft", dailyCap: 15, startsOn: null, endsOn: null, steps: [] });
    expect(await draftEmailStep(SESSION, "bp", NOW)).toMatchObject({ status: 409 });
  });
});

describe("a sent draft advances its member (item 4)", () => {
  it("only a draft of a running campaign whose member sits on that e-mail step", async () => {
    d.campaign.findFirst.mockResolvedValueOnce(null);
    expect(await advanceOnSent(SESSION, "corvid-betonscan-w1", 7, 1, NOW)).toBeNull();
    d.campaign.findFirst.mockResolvedValueOnce({ id: 3 });
    d.campaignMember.findFirst.mockResolvedValueOnce(null);
    expect(await advanceOnSent(SESSION, "bp", 7, 2, NOW)).toBeNull();
    expect(d.campaignMember.updateMany).not.toHaveBeenCalled();
  });
});
