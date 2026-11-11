import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { startLeadLifecycle } from "@/lib/leads/lifecycle-sweep";
import { changeLeadStatus } from "@/lib/leads/service";
import { runAutomations } from "@/lib/automations/engine";
import { resolveDemoHost } from "@/lib/booking/queries";
import { approveCampaign, recordOutcome, setCampaignStatus, specifyCampaign, setSteps } from "./service";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/enrichment/recompute", () => ({ recomputeCloseness: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/automations/engine", () => ({ runAutomations: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/leads/lifecycle-sweep", () => ({ startLeadLifecycle: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/leads/service", () => ({ changeLeadStatus: vi.fn().mockResolvedValue({ success: true, changed: true }) }));
vi.mock("@/lib/booking/queries", () => ({ resolveDemoHost: vi.fn() }));
vi.mock("@/lib/content/service", () => ({ createItem: vi.fn().mockResolvedValue({ ok: true, itemId: 900, versionId: 1, existed: false, status: "in_review", ruleChecks: 0 }) }));
vi.mock("@/lib/db", () => {
  const m = () => vi.fn();
  const db = {
    campaign: { findFirst: m(), update: m(), updateMany: m() },
    campaignMember: { findFirst: m(), findMany: m(), updateMany: m() },
    campaignStep: { deleteMany: m(), createMany: m() },
    campaignEvent: { create: m() },
    contact: { findFirst: m() },
    lead: { findFirst: m(), create: m() },
    leadStatusHistory: { create: m() },
    interaction: { create: m(), updateMany: m() },
    company: { updateMany: m() },
    suppression: { upsert: m() },
    task: { create: m() },
    contentItem: { findMany: m() },
    $transaction: vi.fn(),
  };
  return { db };
});

type M = ReturnType<typeof vi.fn>;
const d = db as unknown as Record<string, Record<string, M>> & { $transaction: M };
const NOW = new Date("2026-11-11T09:00:00Z");
const SESSION = { tenantId: 1, userId: 5 };
const APP = { tenantId: 1, userId: null, appSlug: "corvid" };
const STEPS = [{ position: 1, channel: "email", waitDays: 0 }, { position: 2, channel: "call", waitDays: 3 }];

function member(over: Record<string, unknown> = {}) {
  return {
    id: 44, state: "queued", stepPosition: 2, attempts: 0, companyId: 7, personId: 8,
    company: { name: "Példa Kft.", pipelineStatus: "1" },
    person: { email: "anna@pelda.hu", phone: "+3611", firstName: "Anna", lastName: "Kiss" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  d.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  d.campaign.findFirst.mockResolvedValue({ id: 3, slug: "bp", status: "running", ownerUserId: 9, steps: STEPS });
  d.campaignMember.findFirst.mockResolvedValue(member());
  d.campaignMember.updateMany.mockResolvedValue({ count: 1 });
  d.contact.findFirst.mockResolvedValue({ id: 12 });
  d.lead.findFirst.mockResolvedValue(null);
  d.lead.create.mockResolvedValue({ id: 300 });
  d.interaction.create.mockResolvedValue({ id: 600 });
});

describe("recordOutcome: promotion without an SLA task flood", () => {
  it("Érdeklődik creates a lead in contacting, owner = campaign owner, campaign stamped, no task, no SLA timer", async () => {
    const r = await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "interested" }, NOW);
    expect(r).toMatchObject({ ok: true, lead: { id: 300, created: true, stage: "contacting" }, member: { state: "promoted" } });
    const data = d.lead.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "contacting", assignedToId: 9, campaign: "bp", companyId: 7, contactId: 12, channel: "cold_call" });
    expect(data.nextDue).toBeInstanceOf(Date);
    expect(d.task.create).not.toHaveBeenCalled();
    expect(startLeadLifecycle).not.toHaveBeenCalled();
    expect(d.interaction.create.mock.calls[0][0].data).toMatchObject({ campaign: "bp", type: "call", outcome: "interested" });
    expect(d.campaignEvent.create.mock.calls[0][0].data).toMatchObject({ outcome: "interested", stepPosition: 2, memberId: 44, leadId: 300 });
    expect(runAutomations).toHaveBeenCalledWith(expect.objectContaining({ type: "lead_created", fields: expect.objectContaining({ campaign: "bp" }) }));
  });

  it("Kéri creates a lead in qualified", async () => {
    await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "wants" }, NOW);
    expect(d.lead.create.mock.calls[0][0].data.status).toBe("qualified");
  });

  it("a positive e-mail reply creates a lead in new and starts the SLA timer once", async () => {
    d.campaignMember.findFirst.mockResolvedValue(member({ stepPosition: 1 }));
    const r = await recordOutcome(APP, "bp", { member_id: 44, outcome: "reply_positive" }, NOW);
    expect(r).toMatchObject({ ok: true, lead: { created: true, stage: "new" } });
    expect(d.lead.create.mock.calls[0][0].data).toMatchObject({ status: "new", channel: "cold_email" });
    expect(d.lead.create.mock.calls[0][0].data.nextDue).toBeUndefined();
    expect(startLeadLifecycle).toHaveBeenCalledTimes(1);
    expect(d.interaction.create).not.toHaveBeenCalled();
  });

  it("no answer stays a prospect: no lead, the call is logged", async () => {
    const r = await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "no_answer" }, NOW);
    expect(r).toMatchObject({ ok: true, lead: null, member: { state: "queued", attempts: 1, next_eligible_on: "2026-11-13" } });
    expect(d.lead.create).not.toHaveBeenCalled();
    expect(d.interaction.create).toHaveBeenCalledTimes(1);
  });

  it("an existing open lead is linked and moved forward through the transition table, no second lead", async () => {
    d.lead.findFirst.mockResolvedValue({ id: 250, status: "new" });
    const r = await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "wants" }, NOW);
    expect(d.lead.create).not.toHaveBeenCalled();
    expect(changeLeadStatus).toHaveBeenCalledWith(250, "qualified", expect.objectContaining({ tenantId: 1 }), expect.anything());
    expect(r).toMatchObject({ lead: { id: 250, created: false } });
  });

  it("a double tap (member changed under us) rolls back with 409", async () => {
    d.campaignMember.updateMany.mockResolvedValue({ count: 0 });
    const r = await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "interested" }, NOW);
    expect(r).toMatchObject({ status: 409 });
  });

  it("refuses on a draft campaign", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, slug: "bp", status: "draft", ownerUserId: null, steps: STEPS });
    expect(await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "interested" }, NOW)).toMatchObject({ status: 409 });
  });

  it("unsubscribe writes a suppression", async () => {
    d.campaignMember.findFirst.mockResolvedValue(member({ stepPosition: 1 }));
    await recordOutcome(APP, "bp", { member_id: 44, outcome: "unsubscribe" }, NOW);
    expect(d.suppression.upsert.mock.calls[0][0].create).toMatchObject({ email: "anna@pelda.hu", source: "bp" });
  });
});

describe("only Áron launches", () => {
  beforeEach(() => {
    (resolveDemoHost as M).mockResolvedValue(2);
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", dailyCap: 15, steps: [{ position: 1, channel: "call", waitDays: 0, contentItemId: null, contentItem: null }] });
    d.campaignMember.findMany.mockResolvedValue([{ companyId: 7, state: "queued" }]);
    d.campaign.updateMany.mockResolvedValue({ count: 1 });
  });
  it("an app key can never approve", async () => {
    expect(await approveCampaign(APP, "bp")).toMatchObject({ status: 403 });
    expect(d.campaign.updateMany).not.toHaveBeenCalled();
  });
  it("another CRM user cannot approve", async () => {
    expect(await approveCampaign({ tenantId: 1, userId: 5 }, "bp")).toMatchObject({ status: 403 });
  });
  it("Áron approves: running with hash, approver and time", async () => {
    const r = await approveCampaign({ tenantId: 1, userId: 2 }, "bp");
    expect(r).toMatchObject({ ok: true, status: "running" });
    expect(d.campaign.updateMany.mock.calls[0][0].data).toMatchObject({ status: "running", approvedById: 2 });
  });
  it("an e-mail step whose copy is not live blocks the launch", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", dailyCap: 15, steps: [{ position: 1, channel: "email", waitDays: 0, contentItemId: 5, contentItem: { status: "in_review" } }] });
    expect(await approveCampaign({ tenantId: 1, userId: 2 }, "bp")).toMatchObject({ status: 409 });
  });
  it("an agent may pause but not stop", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "running" });
    expect(await setCampaignStatus(APP, "bp", "paused")).toMatchObject({ ok: true, status: "paused" });
    expect(await setCampaignStatus(APP, "bp", "stopped")).toMatchObject({ status: 403 });
  });
  it("editing steps of a running campaign sends it back to draft", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "running", dailyCap: 15, kind: "cold_call" });
    const r = await setSteps(SESSION, "bp", [{ channel: "call" }]);
    expect(r).toMatchObject({ ok: true, status: "draft" });
    expect(d.campaign.update.mock.calls[0][0].data).toMatchObject({ status: "draft", approvedHash: null });
    expect(await setSteps(APP, "bp", [{ channel: "call" }])).toMatchObject({ status: 403 });
  });
});

describe("specify: proposals only", () => {
  it("writes brief_proposal and in-review assets, never the brief, steps or status", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft" });
    const r = await specifyCampaign(APP, "bp", {
      brief: { offer: "x" }, steps: [{ channel: "email" }, { channel: "call", wait_days: 3 }],
      assets: [{ title: "Szkript", body: "Jó napot", category: "script", channel: "other", content_type: "other", format: "phone_script", step_position: 2 }],
    });
    expect(r).toMatchObject({ ok: true, proposal: { assets: [{ item_id: 900, step_position: 2 }], proposed_by: "corvid" } });
    const data = d.campaign.update.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(["briefProposal"]);
    expect(d.campaignStep.createMany).not.toHaveBeenCalled();
  });
  it("refuses on a running campaign", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "running" });
    expect(await specifyCampaign(APP, "bp", { brief: {} })).toMatchObject({ status: 409 });
  });
});
