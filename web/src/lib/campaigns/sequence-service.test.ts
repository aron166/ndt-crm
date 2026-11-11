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
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn(() => { throw new Error("never send from the campaign engine"); }), getResendConfig: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/db", () => {
  const m = () => vi.fn();
  return { db: {
    campaign: { findFirst: m(), update: m() },
    campaignStep: { deleteMany: m(), createMany: m(), findMany: m() },
    campaignMember: { findFirst: m(), findMany: m(), updateMany: m(), createMany: m() },
    campaignEvent: { findFirst: m(), create: m() },
    contact: { findFirst: m(), findMany: m() }, lead: { findFirst: m(), findMany: m(), create: m() }, interaction: { create: m(), updateMany: m() },
    contentItem: { findMany: m() }, contentReview: { findMany: m() }, tenant: { findUnique: m() }, emailDraft: { findMany: m(), createMany: m(), count: m(), updateMany: m(), deleteMany: m() }, user: { findFirst: m() }, task: { findMany: m(), updateMany: m() },
    suppression: { upsert: m() }, company: { updateMany: m() }, leadStatusHistory: { create: m() },
    $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn().mockResolvedValue(1), $transaction: vi.fn(),
  } };
});

import { setSteps, updateCampaign, recordOutcome, loadLeadAudience, draftEmailStep, advanceOnSent, campaignSendBlock } from "./service";
import { approvalHash } from "./rules";

type M = ReturnType<typeof vi.fn>;
const d = db as unknown as Record<string, Record<string, M>> & { $transaction: M };
const SESSION = { tenantId: 1, userId: 5 };
const NOW = new Date("2026-11-13T09:00:00Z");
const CO = { name: "Minta Kft.", city: null };
/** A live content item as the preview context loads it: the draft uses the LIVE version's text. */
const live = (id: number, title: string, body: string, meta: unknown = null) => ({ id, title, status: "live", sourceMeta: meta, createdAt: new Date("2026-11-01T00:00:00Z"), liveVersion: { id: id * 10, number: 1, body }, currentVersion: { id: id * 10 + 1, number: 2, body: "UNAPPROVED NEWER TEXT" } });

/** A running campaign as approved over exactly these members and items: the drafter re-checks this hash. */
const approvedAs = (c: { steps: unknown[]; dailyCap: number } & Record<string, unknown>, members: { companyId: number }[], items: { id: number; sourceMeta: unknown }[]) => ({
  ...c, outboundAutomations: false,
  approvedHash: approvalHash({
    memberCompanyIds: members.map((m) => m.companyId), steps: c.steps as Parameters<typeof approvalHash>[0]["steps"], dailyCap: c.dailyCap, outboundAutomations: false,
    variants: items.flatMap((i) => { const t = i.sourceMeta as { campaignStep?: number; segment?: string } | null; return t?.campaignStep ? [{ step: t.campaignStep, segment: t.segment!, itemId: i.id }] : []; }),
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  d.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  d.user.findFirst.mockResolvedValue({ role: "admin" });
  d.campaignStep.findMany.mockResolvedValue([]);
  d.tenant.findUnique.mockResolvedValue(null);
  d.contentReview.findMany.mockResolvedValue([]);
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
    const ms1 = [
      { id: 1, companyId: 7, personId: 8, stepPosition: 1, nextEligibleOn: null, person: { email: "a@p.example.test", firstName: "-", lastName: "-" }, company: CO },
      { id: 2, companyId: 9, personId: null, stepPosition: 1, nextEligibleOn: null, person: null, company: CO },
      { id: 3, companyId: 11, personId: 12, stepPosition: 2, nextEligibleOn: null, person: { email: "c@p.example.test", firstName: "-", lastName: "-" }, company: CO },
      { id: 4, companyId: 13, personId: 14, stepPosition: 1, nextEligibleOn: new Date("2026-11-20T00:00:00Z"), person: { email: "d@p.example.test", firstName: "-", lastName: "-" }, company: CO },
    ];
    d.campaignMember.findMany.mockResolvedValue(ms1);
    d.campaign.findFirst.mockResolvedValue(approvedAs({ id: 3, slug: "bp", status: "running", dailyCap: 15, startsOn: null, endsOn: null,
      steps: [{ position: 1, channel: "email", waitDays: 0, contentItemId: 50 }, { position: 2, channel: "email", waitDays: 2, contentItemId: null }] }, ms1, []));
    d.campaignStep.findMany.mockResolvedValue([{ position: 1, contentItemId: 50 }, { position: 2, contentItemId: null }]);
    d.contentItem.findMany.mockResolvedValue([live(50, "Első levél", "Tisztelt ...")]);
    d.emailDraft.findMany.mockResolvedValue([]);
    d.emailDraft.count.mockResolvedValue(0);
    d.lead.findMany.mockResolvedValue([]);
    d.contact.findMany.mockResolvedValue([]);
    d.emailDraft.createMany.mockResolvedValue({ count: 1 });
    const r = await draftEmailStep(SESSION, "bp", NOW);
    expect(r).toMatchObject({ ok: true, drafted: 1, noAddress: 1, noAsset: 1 });
    expect(d.emailDraft.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ companyId: 7, personId: 8, campaign: "bp", step: 1, subject: "Első levél", body: "Tisztelt ...", toEmail: "a@p.example.test", status: "draft" })]);
  });
  it("drafts what the preview shows: the segment's variant, merge fields filled, live text only; an unresolved field is counted, never drafted", async () => {
    d.campaignStep.findMany.mockResolvedValue([{ position: 1, contentItemId: null }]);
    d.campaignMember.findMany.mockResolvedValue([
      { id: 1, companyId: 7, personId: 8, stepPosition: 1, nextEligibleOn: null, person: { email: "a@p.example.test", firstName: "Anna", lastName: "Kovács" }, company: CO, segment: "drillers", lane: null, city: "Győr" },
      { id: 2, companyId: 9, personId: 10, stepPosition: 1, nextEligibleOn: null, person: { email: "b@p.example.test", firstName: "-", lastName: "-" }, company: CO, segment: null, lane: "engineer", city: null },
      { id: 3, companyId: 11, personId: 12, stepPosition: 1, nextEligibleOn: null, person: { email: "c@p.example.test", firstName: "-", lastName: "-" }, company: CO, segment: null, lane: "warm network (Péter phones)", city: null },
    ]);
    const items2 = [
      live(60, "Fúrás előtt", "{{greeting}} {{city}}", { campaignStep: 1, segment: "D" }),
      live(61, "Tervezőknek", "{{greeting}} {{sender_phone}}", { campaignStep: 1, segment: "B" }),
    ];
    d.contentItem.findMany.mockResolvedValue(items2);
    d.campaign.findFirst.mockResolvedValue(approvedAs({ id: 3, slug: "bp", status: "running", dailyCap: 15, startsOn: null, endsOn: null, senderUserId: null,
      approvedAt: new Date("2026-11-12T08:00:00Z"), steps: [{ position: 1, channel: "email", waitDays: 0, contentItemId: null }] }, [{ companyId: 7 }, { companyId: 9 }, { companyId: 11 }], items2));
    d.emailDraft.findMany.mockResolvedValue([]);
    d.emailDraft.count.mockResolvedValue(0);
    d.lead.findMany.mockResolvedValue([]);
    d.contact.findMany.mockResolvedValue([]);
    d.emailDraft.createMany.mockResolvedValue({ count: 1 });
    expect(await draftEmailStep(SESSION, "bp", NOW)).toMatchObject({ ok: true, drafted: 1, unresolved: 1, noAsset: 1 });
    expect(d.emailDraft.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ companyId: 7, subject: "Fúrás előtt", body: "Tisztelt Kovács Anna! Győr", templateVersionId: 600 })]);
  });
  it("Vanda #195-1: a variant created after the approval is never drafted on a running campaign", async () => {
    // Approved with no variant; the variant came later.
    d.campaign.findFirst.mockResolvedValue(approvedAs({ id: 3, slug: "bp", status: "running", dailyCap: 15, startsOn: null, endsOn: null, senderUserId: null,
      approvedAt: new Date("2026-11-12T08:00:00Z"), steps: [{ position: 1, channel: "email", waitDays: 0, contentItemId: null }] }, [{ companyId: 7 }], []));
    d.campaignStep.findMany.mockResolvedValue([{ position: 1, contentItemId: null }]);
    d.campaignMember.findMany.mockResolvedValue([
      { id: 1, companyId: 7, personId: 8, stepPosition: 1, nextEligibleOn: null, person: { email: "a@p.example.test", firstName: "-", lastName: "-" }, company: CO, segment: "drillers", lane: null, city: null },
    ]);
    d.contentItem.findMany.mockResolvedValue([{ ...live(60, "Később jött", "Szöveg", { campaignStep: 1, segment: "D" }), createdAt: new Date("2026-11-12T10:00:00Z") }]);
    d.emailDraft.findMany.mockResolvedValue([]);
    d.emailDraft.count.mockResolvedValue(0);
    d.lead.findMany.mockResolvedValue([]);
    d.contact.findMany.mockResolvedValue([]);
    expect(await draftEmailStep(SESSION, "bp", NOW)).toMatchObject({ status: 409 });
    expect(d.emailDraft.createMany).not.toHaveBeenCalled();
  });
  it("Vanda #195 r2-1: a variant archived at approval and restored later is never drafted (the approval hash no longer matches)", async () => {
    const steps = [{ position: 1, channel: "email" as const, waitDays: 0, contentItemId: null }];
    // Approved while the variant was archived: no variants in the hash.
    const approvedHash = approvalHash({ memberCompanyIds: [7], steps, dailyCap: 15, outboundAutomations: false });
    d.campaign.findFirst.mockResolvedValue({ id: 3, slug: "bp", status: "running", dailyCap: 15, startsOn: null, endsOn: null, senderUserId: null, outboundAutomations: false, audience: null,
      approvedAt: new Date("2026-11-12T08:00:00Z"), approvedHash, steps });
    d.campaignStep.findMany.mockResolvedValue([{ position: 1, contentItemId: null }]);
    d.campaignMember.findMany.mockResolvedValue([
      { id: 1, companyId: 7, personId: 8, stepPosition: 1, nextEligibleOn: null, person: { email: "a@p.example.test", firstName: "-", lastName: "-" }, company: CO, segment: "drillers", lane: null, city: null },
    ]);
    // Restored to live after the approval; created long before it.
    d.contentItem.findMany.mockResolvedValue([live(60, "Visszaállított", "Szöveg", { campaignStep: 1, segment: "D" })]);
    d.emailDraft.findMany.mockResolvedValue([]);
    d.emailDraft.count.mockResolvedValue(0);
    d.lead.findMany.mockResolvedValue([]);
    d.contact.findMany.mockResolvedValue([]);
    expect(await draftEmailStep(SESSION, "bp", NOW)).toMatchObject({ status: 409 });
    expect(d.emailDraft.createMany).not.toHaveBeenCalled();
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

describe("Vanda #194 fixes", () => {
  const base = { id: 3, slug: "bp", status: "running", dailyCap: 2, startsOn: null, endsOn: null, audience: null, steps: [{ position: 1, channel: "email", waitDays: 0, contentItemId: 50 }] };
  const running = (ms: { companyId: number }[]) => approvedAs(base, ms, []);
  const mem = (id: number, companyId: number, email: string | null) => ({ id, companyId, personId: id * 10, stepPosition: 1, nextEligibleOn: null, person: email ? { email, firstName: "-", lastName: "-" } : null, company: { name: `Cég ${id}`, city: null }, segment: null, lane: null, city: null });
  beforeEach(() => {
    d.campaignStep.findMany.mockResolvedValue([{ position: 1, contentItemId: 50 }]);
    d.contentItem.findMany.mockResolvedValue([live(50, "Levél", "Szöveg")]);
    d.emailDraft.findMany.mockResolvedValue([]);
    d.emailDraft.count.mockResolvedValue(0);
    d.lead.findMany.mockResolvedValue([]);
    d.contact.findMany.mockResolvedValue([]);
    d.emailDraft.createMany.mockResolvedValue({ count: 1 });
  });
  it("1: a prospect who replied (a replied draft or an open lead) gets no further cold e-mail", async () => {
    d.campaign.findFirst.mockResolvedValue(running([{ companyId: 7 }, { companyId: 9 }]));
    d.campaignMember.findMany.mockResolvedValue([mem(1, 7, "a@x.example.test"), mem(2, 9, "b@x.example.test")]);
    d.emailDraft.findMany.mockResolvedValue([{ companyId: 9, step: 1, status: "replied" }]); // a reply on an earlier touch
    d.lead.findMany.mockResolvedValue([{ companyId: 7 }]); // became a lead some other way
    expect(await draftEmailStep(SESSION, "bp", NOW)).toMatchObject({ drafted: 0 });
    expect(d.emailDraft.createMany).not.toHaveBeenCalled();
  });
  it("4: the address may sit on the company's contact", async () => {
    d.campaign.findFirst.mockResolvedValue(running([{ companyId: 7 }]));
    d.campaignMember.findMany.mockResolvedValue([mem(1, 7, null)]);
    d.contact.findMany.mockResolvedValue([{ companyId: 7, personId: 10, email: "k@x.example.test", person: { email: null } }]);
    expect(await draftEmailStep(SESSION, "bp", NOW)).toMatchObject({ drafted: 1, noAddress: 0 });
  });
  it("5: the daily cap counts today's drafts already made", async () => {
    d.campaign.findFirst.mockResolvedValue(running([{ companyId: 7 }, { companyId: 9 }]));
    d.campaignMember.findMany.mockResolvedValue([mem(1, 7, "a@x.example.test"), mem(2, 9, "b@x.example.test")]);
    d.emailDraft.count.mockResolvedValue(1);
    expect(await draftEmailStep(SESSION, "bp", NOW)).toMatchObject({ drafted: 1 });
    expect(d.emailDraft.createMany.mock.calls[0][0]).toMatchObject({ skipDuplicates: true });
  });
  it("2: a draft of a member campaign that is not running cannot be sent; other keys are untouched", async () => {
    d.campaign.findFirst.mockResolvedValueOnce({ kind: "sequence", status: "draft" });
    expect(await campaignSendBlock(1, "bp")).toMatch(/nem fut/);
    d.campaign.findFirst.mockResolvedValueOnce({ kind: "sequence", status: "running" });
    expect(await campaignSendBlock(1, "bp")).toBeNull();
    d.campaign.findFirst.mockResolvedValueOnce(null);
    expect(await campaignSendBlock(1, "corvid-betonscan-w1")).toBeNull();
    d.campaign.findFirst.mockResolvedValueOnce({ kind: null, status: "draft" });
    expect(await campaignSendBlock(1, "birdsview_q3")).toBeNull();
  });
});

describe("Vanda #194 r2: a step edit retires its stale drafts", () => {
  it("drafts of a removed step or a step whose asset changed are cancelled; unchanged steps keep theirs", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, slug: "bp", status: "running", dailyCap: 15, kind: "sequence", audience: null });
    d.campaignStep.findMany.mockResolvedValue([
      { position: 1, channel: "email", contentItemId: 50 }, { position: 2, channel: "email", contentItemId: 51 }, { position: 3, channel: "email", contentItemId: 52 },
    ]);
    d.emailDraft.findMany.mockResolvedValueOnce([{ id: 900 }, { id: 901 }]);
    d.contentItem.findMany.mockResolvedValue([{ id: 50, campaignId: 3 }, { id: 61, campaignId: null }]);
    await setSteps(SESSION, "bp", [{ channel: "email", content_item_id: 50 }, { channel: "email", wait_days: 2, content_item_id: 61 }]);
    // Deleted, not cancelled: a kept row would block the re-draft (unique key, seen set) and strand the member (Vanda #194 r3).
    expect(d.emailDraft.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 1, id: { in: [900, 901] } } });
    expect(d.emailDraft.updateMany).not.toHaveBeenCalled();
  });
  it("a step that switches channel retires its drafts even with the same asset", async () => {
    d.campaign.findFirst.mockResolvedValue({ id: 3, slug: "bp", status: "draft", dailyCap: 15, kind: "sequence", audience: null });
    d.campaignStep.findMany.mockResolvedValue([{ position: 1, channel: "email", contentItemId: null }, { position: 2, channel: "email", contentItemId: 54 }]);
    d.contentItem.findMany.mockResolvedValue([{ id: 54, campaignId: 3 }]);
    d.emailDraft.findMany.mockResolvedValueOnce([{ id: 902 }]);
    await setSteps(SESSION, "bp", [{ channel: "email" }, { channel: "call", wait_days: 2, content_item_id: 54 }]);
    expect(d.emailDraft.findMany.mock.calls[0][0].where).toMatchObject({ step: { in: [2] } });
  });
});
