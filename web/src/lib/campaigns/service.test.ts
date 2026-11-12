import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { startLeadLifecycle } from "@/lib/leads/lifecycle-sweep";
import { changeLeadStatus } from "@/lib/leads/service";
import { runAutomations } from "@/lib/automations/engine";
import { resolveDemoHost } from "@/lib/booking/queries";
import { approvalHash, type StepDef } from "./rules";
import { addMembers, approveCampaign, recordOutcome, setCampaignStatus, specifyCampaign, setSteps, undoBatch, updateCampaign } from "./service";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
import { audit } from "@/lib/audit";
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/enrichment/recompute", () => ({ recomputeCloseness: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/automations/engine", () => ({ runAutomations: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/leads/lifecycle-sweep", () => ({ startLeadLifecycle: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/leads/service", () => ({ changeLeadStatus: vi.fn().mockResolvedValue({ success: true, changed: true }) }));
vi.mock("@/lib/booking/queries", () => ({ resolveDemoHost: vi.fn() }));
vi.mock("@/lib/suppression", () => ({ loadSuppressionSet: vi.fn().mockResolvedValue({ emails: new Set(), domains: new Set() }) }));
vi.mock("@/lib/content/service", () => ({ createItem: vi.fn().mockResolvedValue({ ok: true, itemId: 900, versionId: 1, existed: false, status: "in_review", ruleChecks: 0 }) }));
vi.mock("@/lib/db", () => {
  const m = () => vi.fn();
  const db = {
    campaign: { findFirst: m(), update: m(), updateMany: m() },
    campaignMember: { findFirst: m(), findMany: m(), updateMany: m(), create: m(), deleteMany: m() },
    user: { findFirst: m() },
    person: { findMany: m(), create: m(), updateMany: m() },
    emailDraft: { findMany: m(), findFirst: m(), updateMany: m() }, invoice: { findMany: m() }, proposal: { findMany: m() }, quote: { findMany: m() },
    company: { findMany: m(), updateMany: m(), create: m() },
    campaignStep: { deleteMany: m(), createMany: m(), findMany: vi.fn().mockResolvedValue([]) },
    campaignEvent: { create: m(), findFirst: m() },
    contact: { findFirst: m(), findMany: m(), create: m(), updateMany: m() },
    lead: { findFirst: m(), create: m(), findMany: m() },
    leadStatusHistory: { create: m() },
    interaction: { create: m(), updateMany: m(), findMany: m() },
    suppression: { upsert: m() },
    task: { create: m(), findMany: m(), updateMany: m() },
    contentItem: { findMany: m() },
    deal: { findMany: m() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
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
    person: { email: "anna@pelda.example.test", phone: "+3611", firstName: "Anna", lastName: "Kiss" },
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
  d.emailDraft.updateMany.mockResolvedValue({ count: 0 });
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

  it("unsubscribe suppresses the address the event names, even when the person has none", async () => {
    d.campaignMember.findFirst.mockResolvedValue(member({ stepPosition: 1, person: { email: null, phone: "+3611", firstName: "A", lastName: "B" } }));
    const r = await recordOutcome(APP, "bp", { member_id: 44, outcome: "unsubscribe", email: "Info@Pelda.example.test" }, NOW);
    expect(r).toMatchObject({ suppressed: true });
    expect(d.suppression.upsert.mock.calls[0][0].create).toMatchObject({ email: "info@pelda.example.test" });
  });

  it("a lead created meanwhile by another flow is found under the company lock and linked, not duplicated", async () => {
    d.lead.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 260, status: "new" });
    const r = await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "interested" }, NOW);
    expect(d.lead.create).not.toHaveBeenCalled();
    expect(r).toMatchObject({ lead: { id: 260, created: false } });
  });

  it("unsubscribe writes a suppression", async () => {
    d.campaignMember.findFirst.mockResolvedValue(member({ stepPosition: 1 }));
    await recordOutcome(APP, "bp", { member_id: 44, outcome: "unsubscribe" }, NOW);
    expect(d.suppression.upsert.mock.calls[0][0].create).toMatchObject({ email: "anna@pelda.example.test", source: "bp" });
  });
});

describe("only Áron launches", () => {
  beforeEach(() => {
    (resolveDemoHost as M).mockResolvedValue(2);
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", kind: "cold_call", dailyCap: 15, outboundAutomations: false, steps: [{ position: 1, channel: "call", waitDays: 0, contentItemId: null, contentItem: null }] });
    d.campaignMember.findMany.mockResolvedValue([{ companyId: 7, state: "queued" }]);
    d.campaign.updateMany.mockResolvedValue({ count: 1 });
    d.contentItem.findMany.mockResolvedValue([]);
  });
  it("segment variants: a proposal variant blocks the launch; all variants live launch an e-mail step with no own asset, and join the hash", async () => {
    const step = { position: 1, channel: "email", waitDays: 0, contentItemId: null, contentItem: null };
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", kind: "cold_email", dailyCap: 15, outboundAutomations: false, steps: [step] });
    d.contentItem.findMany.mockResolvedValue([{ id: 60, status: "in_review", sourceMeta: { campaignStep: 1, segment: "A" } }]);
    expect(await approveCampaign({ tenantId: 1, userId: 2 }, "bp")).toMatchObject({ status: 409, error: expect.stringMatching(/szegmensváltozat/) });
    d.contentItem.findMany.mockResolvedValue([{ id: 60, status: "live", sourceMeta: { campaignStep: 1, segment: "A" } }]);
    const r = await approveCampaign({ tenantId: 1, userId: 2 }, "bp");
    expect(r).toMatchObject({ ok: true });
    const plain = approvalHash({ memberCompanyIds: [7], steps: [step as StepDef & { contentItemId: null }], dailyCap: 15 });
    expect((r as { approved_hash: string }).approved_hash).not.toBe(plain);
    expect(approvalHash({ memberCompanyIds: [7], steps: [step as StepDef & { contentItemId: null }], dailyCap: 15, variants: [] })).toBe(plain);
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
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", kind: "sequence", dailyCap: 15, steps: [{ position: 1, channel: "email", waitDays: 0, contentItemId: 5, contentItem: { status: "in_review" } }] });
    expect(await approveCampaign({ tenantId: 1, userId: 2 }, "bp")).toMatchObject({ status: 409 });
  });
  it("approve refuses when the campaign changed since the approver looked, even a same-size member swap", async () => {
    const steps: (StepDef & { contentItemId: number | null })[] = [{ position: 1, channel: "call", waitDays: 0, contentItemId: null }];
    const seen = approvalHash({ memberCompanyIds: [8], steps, dailyCap: 15 }); // he saw company 8; company 7 is there now
    expect(await approveCampaign({ tenantId: 1, userId: 2 }, "bp", { hash: seen })).toMatchObject({ status: 409 });
    expect(d.campaign.updateMany).not.toHaveBeenCalled();
    const now = approvalHash({ memberCompanyIds: [7], steps, dailyCap: 15 });
    expect(await approveCampaign({ tenantId: 1, userId: 2 }, "bp", { hash: now })).toMatchObject({ ok: true, approved_hash: now });
  });
  it("a sequence whose call comes before the e-mail cannot launch", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", kind: "sequence", dailyCap: 15, steps: [
      { position: 1, channel: "call", waitDays: 0, contentItemId: null, contentItem: null },
      { position: 2, channel: "email", waitDays: 0, contentItemId: 5, contentItem: { status: "live" } },
    ] });
    expect(await approveCampaign({ tenantId: 1, userId: 2 }, "bp")).toMatchObject({ status: 409 });
    expect(d.campaign.updateMany).not.toHaveBeenCalled();
  });
  it("an ad or organic campaign is content only: no launch", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", kind: "ad", dailyCap: 15, steps: [{ position: 1, channel: "ad", waitDays: 0, contentItemId: null, contentItem: null }] });
    expect(await approveCampaign({ tenantId: 1, userId: 2 }, "bp")).toMatchObject({ status: 409 });
  });
  it("an agent may pause but not stop", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "running" });
    expect(await setCampaignStatus(APP, "bp", "paused")).toMatchObject({ ok: true, status: "paused" });
    expect(await setCampaignStatus(APP, "bp", "stopped")).toMatchObject({ status: 403 });
  });
  it("approve takes the campaign row lock before reading what it hashes", async () => {
    await approveCampaign({ tenantId: 1, userId: 2 }, "bp");
    expect(d.$queryRaw).toHaveBeenCalled();
    const order = (f: M) => (f.mock as unknown as { invocationCallOrder: number[] }).invocationCallOrder[0];
    expect(order(d.$queryRaw as unknown as M)).toBeLessThan(order(d.campaignMember.findMany));
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
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", kind: "sequence" });
    d.task.findMany.mockResolvedValue([{ id: 91 }]);
    const r = await specifyCampaign(APP, "bp", {
      brief: { offer: "x" }, steps: [{ channel: "email" }, { channel: "call", wait_days: 3 }],
      assets: [{ title: "Szkript", body: "Jó napot", category: "script", channel: "other", content_type: "other", format: "phone_script", step_position: 2 }],
    });
    expect(r).toMatchObject({ ok: true, proposal: { assets: [{ item_id: 900, step_position: 2 }], proposed_by: "corvid" } });
    const data = d.campaign.update.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(["briefProposal"]);
    expect(d.campaignStep.createMany).not.toHaveBeenCalled();
    // The proposal answers this campaign's open specification requests, and only this campaign's (item 6).
    expect(d.task.updateMany.mock.calls[0][0]).toMatchObject({
      where: { tenantId: 1, status: { in: ["created", "in_progress"] }, setMembership: { hasEvery: ["campaign_spec_request", "campaign:bp"] }, id: { in: [91] } },
      data: { status: "done" },
    });
  });
  it("an empty proposal is a 400 and closes no request (Vanda #192-3)", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", kind: "sequence" });
    expect(await specifyCampaign(APP, "bp", {})).toMatchObject({ status: 400 });
    expect(await specifyCampaign(APP, "bp", { brief: {} })).toMatchObject({ status: 400 });
    expect(d.task.updateMany).not.toHaveBeenCalled();
  });
  it("closing a request is audited with the agent as actor (Vanda #192-2)", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", kind: "sequence" });
    d.task.findMany.mockResolvedValue([{ id: 91 }]);
    await specifyCampaign(APP, "bp", { brief: { offer: "x" } });
    expect(audit).toHaveBeenCalledWith("task", 91, "update", { status: "open" }, { status: "done", by: "corvid" }, expect.objectContaining({ actorAgentId: "corvid" }));
  });
  it("proposed steps must fit the kind (a call before the e-mail is a 400)", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft", kind: "sequence" });
    expect(await specifyCampaign(APP, "bp", { steps: [{ channel: "call" }, { channel: "email" }] })).toMatchObject({ status: 400 });
  });
  it("a session user's assets are refused (they go through Marketing with their author)", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "draft" });
    expect(await specifyCampaign(SESSION, "bp", { assets: [{ title: "x", body: "y", category: "script", channel: "other", content_type: "other" }] })).toMatchObject({ status: 400 });
  });
  it("refuses on a running campaign", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "running" });
    expect(await specifyCampaign(APP, "bp", { brief: {} })).toMatchObject({ status: 409 });
  });
});

describe("stop is final", () => {
  it("a PATCH cannot bring a stopped campaign back to draft", async () => {
    const { updateCampaign } = await import("./service");
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "stopped", dailyCap: 15, briefProposal: null });
    expect(await updateCampaign(SESSION, "bp", { daily_cap: 20 })).toMatchObject({ status: 409 });
    expect(d.campaign.update).not.toHaveBeenCalled();
  });
});

describe("member loads and undo are session only with an operator role (Kai, Vanda #188-3)", () => {
  const SEQ = { id: 3, status: "draft", kind: "sequence", steps: STEPS };
  const rows = [{ company_name: "Új Kft.", email: "a@uj.example.test" }];
  beforeEach(() => {
    d.campaign.findFirst.mockResolvedValue(SEQ);
    for (const t of ["company", "lead", "campaignMember", "person", "contact", "deal", "emailDraft", "invoice", "proposal", "quote", "task", "interaction"]) d[t].findMany.mockResolvedValue([]);
    d.person.create.mockResolvedValue({ id: 80 });
  });
  it("an app key may dry-run a load and gets the counts", async () => {
    const r = await addMembers(APP, "bp", { dry_run: true, batch: "b1", rows });
    expect(r).toMatchObject({ ok: true, dry_run: true, summary: { add: 1 } });
  });
  it("an app key gets 403 on apply and nothing is written", async () => {
    expect(await addMembers(APP, "bp", { dry_run: false, batch: "b1", rows })).toMatchObject({ status: 403 });
    expect(d.$transaction).not.toHaveBeenCalled();
    expect(d.company.findMany).not.toHaveBeenCalled();
  });
  it("a member-role user gets 403 on apply; an admin applies", async () => {
    d.user.findFirst.mockResolvedValue({ role: "member" });
    expect(await addMembers(SESSION, "bp", { dry_run: false, batch: "b1", rows })).toMatchObject({ status: 403 });
    d.user.findFirst.mockResolvedValue({ role: "admin" });
    d.company.create.mockResolvedValue({ id: 70 });
    expect(await addMembers(SESSION, "bp", { dry_run: false, batch: "b1", rows })).toMatchObject({ ok: true, dry_run: false, added: 1 });
  });
  it("an app key gets 403 on undo; its dry run still answers", async () => {
    expect(await undoBatch(APP, "bp", "b1", false)).toMatchObject({ status: 403 });
    expect(d.campaignMember.deleteMany).not.toHaveBeenCalled();
    expect(await undoBatch(APP, "bp", "b1", true)).toMatchObject({ ok: true, dry_run: true });
  });
  it("an undo that removes members of a running campaign sends it back to draft", async () => {
    d.campaign.findFirst.mockResolvedValue({ ...SEQ, status: "running" });
    d.user.findFirst.mockResolvedValue({ role: "admin" });
    d.campaignMember.findMany.mockResolvedValue([{ id: 9, companyId: 70, personId: null, attempts: 0, lastTouchedAt: null, leadId: null, createdCompany: false, createdPerson: false }]);
    d.campaignMember.deleteMany.mockResolvedValue({ count: 1 });
    expect(await undoBatch(SESSION, "bp", "b1", false)).toMatchObject({ ok: true });
    expect(d.campaign.update.mock.calls[0][0].data).toMatchObject({ status: "draft", approvedHash: null });
  });
  describe("prospects:write key (scopes)", () => {
    const KEY = { ...APP, scopes: ["prospects:write" as const] };
    const READ = { ...APP, scopes: ["read" as const] };
    const LEGACY = { ...APP, scopes: null };
    it("a key writes and undoes only batches named after its own app slug (Vanda #197-3)", async () => {
      d.campaignMember.findMany.mockResolvedValue([]);
      d.campaignMember.deleteMany.mockResolvedValue({ count: 0 });
      const own = `${KEY.appSlug}-2026-11-12`;
      expect(await undoBatch(KEY, "bp", "human-batch", false)).toMatchObject({ status: 403 });
      expect(await addMembers(KEY, "bp", { dry_run: false, batch: "human-batch", rows })).toMatchObject({ status: 403 });
      expect(await undoBatch(KEY, "bp", own, false)).toMatchObject({ ok: true });
    });
    it("addMembers apply: prospects:write proceeds, legacy and read-only get 403, session operator unchanged", async () => {
      d.company.create.mockResolvedValue({ id: 70 });
      expect(await addMembers(KEY, "bp", { dry_run: false, batch: "corvid-b1", rows })).toMatchObject({ ok: true, dry_run: false, added: 1 });
      d.$transaction.mockClear();
      expect(await addMembers(LEGACY, "bp", { dry_run: false, batch: "b1", rows })).toMatchObject({ status: 403 });
      expect(await addMembers(READ, "bp", { dry_run: false, batch: "b1", rows })).toMatchObject({ status: 403 });
      expect(d.$transaction).not.toHaveBeenCalled();
      d.user.findFirst.mockResolvedValue({ role: "admin" });
      expect(await addMembers(SESSION, "bp", { dry_run: false, batch: "b1", rows })).toMatchObject({ ok: true, added: 1 });
    });
    it("undoBatch apply: prospects:write proceeds, legacy and read-only get 403, session operator unchanged", async () => {
      d.campaignMember.findMany.mockResolvedValue([]);
      d.campaignMember.deleteMany.mockResolvedValue({ count: 0 });
      expect(await undoBatch(KEY, "bp", "corvid-b1", false)).toMatchObject({ ok: true, dry_run: false });
      expect(await undoBatch(LEGACY, "bp", "b1", false)).toMatchObject({ status: 403 });
      expect(await undoBatch(READ, "bp", "b1", false)).toMatchObject({ status: 403 });
      d.user.findFirst.mockResolvedValue({ role: "admin" });
      expect(await undoBatch(SESSION, "bp", "b1", false)).toMatchObject({ ok: true });
    });
  });
  it("a content-only campaign takes no members", async () => {
    d.campaign.findFirst.mockResolvedValue({ ...SEQ, kind: "organic" });
    expect(await addMembers(APP, "bp", { dry_run: true, batch: "b1", rows })).toMatchObject({ status: 409 });
  });
});

describe("a campaign promotion sends nothing by default (Vanda #188-8)", () => {
  it("lead_created from a promotion skips send_email and webhook_out rules", async () => {
    await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "interested" }, NOW);
    expect(runAutomations).toHaveBeenCalledWith(expect.objectContaining({ type: "lead_created", skipActionTypes: ["send_email", "webhook_out"] }));
  });
  it("moving an existing lead forward skips them too", async () => {
    d.lead.findFirst.mockResolvedValue({ id: 250, status: "new" });
    await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "wants" }, NOW);
    expect(changeLeadStatus).toHaveBeenCalledWith(250, "qualified", expect.anything(), expect.objectContaining({ skipAutomationActions: ["send_email", "webhook_out"] }));
  });
  it("only a campaign that opted in lets them run", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, slug: "bp", status: "running", ownerUserId: 9, outboundAutomations: true, steps: STEPS });
    await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "interested" }, NOW);
    expect(runAutomations).toHaveBeenCalledWith(expect.objectContaining({ skipActionTypes: [] }));
  });
  it("only Áron switches outbound automations on, and it sends a running campaign back to draft", async () => {
    (resolveDemoHost as M).mockResolvedValue(2);
    d.campaign.findFirst.mockResolvedValue({ id: 3, status: "running", dailyCap: 15, briefProposal: null, outboundAutomations: false });
    expect(await updateCampaign(SESSION, "bp", { outbound_automations: true })).toMatchObject({ status: 403 });
    expect(d.campaign.update).not.toHaveBeenCalled();
    expect(await updateCampaign({ tenantId: 1, userId: 2 }, "bp", { outbound_automations: true })).toMatchObject({ ok: true, status: "draft" });
    expect(d.campaign.update.mock.calls[0][0].data).toMatchObject({ outboundAutomations: true, status: "draft", approvedHash: null });
  });
});

describe("per-campaign automations (item 5)", () => {
  it("a touch raises its campaign events with the campaign id, outbound actions skipped while the switch is off", async () => {
    await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "interested" }, NOW);
    const calls = (runAutomations as M).mock.calls.map((c) => c[0]);
    const camp = calls.filter((e) => String(e.type).startsWith("campaign_"));
    expect(camp.map((e) => e.type)).toEqual(["campaign_call_outcome", "campaign_member_promoted"]);
    for (const e of camp) expect(e).toMatchObject({ campaignId: 3, skipActionTypes: ["send_email", "webhook_out"] });
  });
  it("with Áron's outbound switch on, campaign events may run outbound actions", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, slug: "bp", status: "running", ownerUserId: 9, outboundAutomations: true, steps: STEPS });
    await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "no_answer" }, NOW);
    const camp = (runAutomations as M).mock.calls.map((c) => c[0]).filter((e) => String(e.type).startsWith("campaign_"));
    expect(camp).toEqual([expect.objectContaining({ type: "campaign_call_outcome", outcome: "no_answer", skipActionTypes: [] })]);
  });
});

describe("one reply path (C2): a reply logged in the hub stops the outreach like /outreach does", () => {
  beforeEach(() => {
    d.campaignMember.findFirst.mockResolvedValue(member({ stepPosition: 1 }));
    d.emailDraft.findFirst.mockResolvedValue({ id: 70 });
    d.emailDraft.updateMany.mockResolvedValue({ count: 1 });
  });

  it("reply_positive: the answered touch is replied, every queued touch to the company in every campaign is cancelled, the SLA starts once", async () => {
    const r = await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "reply_positive" }, NOW);
    expect(r).toMatchObject({ ok: true });
    expect(d.emailDraft.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: 1, companyId: 7, campaign: "bp", status: "sent" });
    const [flip, cancel] = d.emailDraft.updateMany.mock.calls.map((c) => c[0]);
    expect(flip).toMatchObject({ where: { id: 70, tenantId: 1, status: "sent" }, data: { status: "replied", replyType: null } });
    expect(cancel).toMatchObject({ where: { tenantId: 1, companyId: 7, status: { in: ["draft", "approved", "failed"] } }, data: { status: "cancelled" } });
    expect(cancel.where).not.toHaveProperty("campaign");
    expect(startLeadLifecycle).toHaveBeenCalledTimes(1);
  });

  it("reply_negative stops the outreach too", async () => {
    await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "reply_negative" }, NOW);
    expect(d.emailDraft.updateMany.mock.calls[0][0]).toMatchObject({ data: { status: "replied", replyType: "no" } });
    expect(d.emailDraft.updateMany.mock.calls[1][0]).toMatchObject({ data: { status: "cancelled" } });
  });

  it("no sent touch found: nothing is flipped, the queued touches are still cancelled", async () => {
    d.emailDraft.findFirst.mockResolvedValue(null);
    await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "reply_positive" }, NOW);
    expect(d.emailDraft.updateMany).toHaveBeenCalledTimes(1);
    expect(d.emailDraft.updateMany.mock.calls[0][0]).toMatchObject({ data: { status: "cancelled" } });
  });

  it("logging the same reply twice changes nothing more", async () => {
    d.campaignMember.findFirst.mockResolvedValue(member({ stepPosition: 1, state: "promoted" }));
    const r = await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "reply_positive" }, NOW);
    expect(r).toMatchObject({ status: 409 });
    expect(d.emailDraft.updateMany).not.toHaveBeenCalled();
    expect(startLeadLifecycle).not.toHaveBeenCalled();
    expect(d.lead.create).not.toHaveBeenCalled();
  });

  it("a call outcome touches no draft", async () => {
    await recordOutcome(SESSION, "bp", { member_id: 44, outcome: "no_answer" }, NOW);
    expect(d.emailDraft.updateMany).not.toHaveBeenCalled();
  });
});
