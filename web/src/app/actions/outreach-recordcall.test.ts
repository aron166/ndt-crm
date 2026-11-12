import { describe, it, expect, vi, beforeEach } from "vitest";

// recordCall (/calls "Hívás mód" cockpit) on the one call-outcome writer (C1).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/enrichment/recompute", () => ({ recomputeCloseness: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/actor", () => ({ userLeadCtx: vi.fn(), requireCrmUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/leads/service", () => ({ completeOpenLeadCallTasks: vi.fn().mockResolvedValue(1) }));
vi.mock("@/lib/campaigns/service", () => ({
  findCallableMembers: vi.fn(), recordOutcome: vi.fn(), advanceMembersForCall: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/db", () => {
  const m = () => vi.fn();
  const db = {
    company: { findFirst: m(), update: m() },
    person: { findFirst: m() },
    lead: { findFirst: m(), updateMany: m() },
    interaction: { create: m() },
    task: { create: m(), updateMany: m() },
    $transaction: vi.fn(),
  };
  return { db };
});

import { db } from "@/lib/db";
import { userLeadCtx } from "@/lib/actor";
import { completeOpenLeadCallTasks } from "@/lib/leads/service";
import { findCallableMembers, recordOutcome, advanceMembersForCall } from "@/lib/campaigns/service";
import { recordCall } from "./outreach";

type M = ReturnType<typeof vi.fn>;
const d = db as unknown as Record<string, Record<string, M>> & { $transaction: M };
const mk = (f: unknown) => f as M;

beforeEach(() => {
  vi.clearAllMocks();
  mk(userLeadCtx).mockResolvedValue({ tenantId: 1, userId: 5, actor: "user" });
  d.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  d.company.findFirst.mockResolvedValue({ id: 7, name: "Példa Kft.", pipelineStatus: "1" });
  d.person.findFirst.mockResolvedValue({ id: 8 });
  d.lead.findFirst.mockResolvedValue(null);
  d.interaction.create.mockResolvedValue({ id: 600 });
  d.company.update.mockResolvedValue({});
  d.task.create.mockResolvedValue({ id: 900, title: "Visszahívás: Példa Kft." });
  mk(findCallableMembers).mockResolvedValue([]);
});

describe("recordCall: one call-outcome writer", () => {
  it("not a CRM user: refused, nothing written", async () => {
    mk(userLeadCtx).mockResolvedValue({ error: "no" });
    expect(await recordCall({ companyId: 7, outcome: "no_answer" })).toEqual({ error: "no" });
    expect(d.interaction.create).not.toHaveBeenCalled();
  });

  it("company in a campaign waiting for a call: goes through recordOutcome (member, event, promotion, automations), other campaigns advance without a second call log", async () => {
    mk(findCallableMembers).mockResolvedValue([{ memberId: 44, campaignId: 3, slug: "bp" }, { memberId: 45, campaignId: 4, slug: "other" }]);
    mk(recordOutcome).mockResolvedValue({ ok: true, interaction_id: 601, lead: { id: 300, created: true }, member: { id: 44 } });
    const r = await recordCall({ companyId: 7, personId: 8, outcome: "interested", notes: "jó", durationSec: 65, followupDate: "2026-11-20" });
    expect(r).toMatchObject({ success: true, newStatus: "3", taskCreated: true });
    expect(recordOutcome).toHaveBeenCalledWith({ tenantId: 1, userId: 5 }, "bp",
      { member_id: 44, outcome: "interested", notes: "jó", duration_sec: 65, followup_date: "2026-11-20" }, expect.any(Date));
    expect(advanceMembersForCall).toHaveBeenCalledWith({ tenantId: 1, userId: 5 }, 7, "interested", expect.any(Date), 3);
    expect(d.interaction.create).not.toHaveBeenCalled();
    expect(d.task.create.mock.calls[0][0].data).toMatchObject({ leadId: 300, companyId: 7, assignedToId: 5 });
  });

  it("the campaign refuses the touch: the error comes back, nothing else is written", async () => {
    mk(findCallableMembers).mockResolvedValue([{ memberId: 44, campaignId: 3, slug: "bp" }]);
    mk(recordOutcome).mockResolvedValue({ error: "A tag időközben változott, frissíts", status: 409 });
    expect(await recordCall({ companyId: 7, outcome: "no_answer" })).toEqual({ error: "A tag időközben változott, frissíts" });
    expect(d.task.create).not.toHaveBeenCalled();
    expect(advanceMembersForCall).not.toHaveBeenCalled();
  });

  it("no campaign, open lead: the call is the lead's (user, lead id), its open call tasks are done, the follow-up is the lead's next step", async () => {
    d.lead.findFirst.mockResolvedValue({ id: 250 });
    const r = await recordCall({ companyId: 7, outcome: "no_answer", followupDate: "2026-11-20" });
    expect(r).toMatchObject({ success: true, newStatus: "2", taskCreated: true });
    expect(d.interaction.create.mock.calls[0][0].data).toMatchObject({ userId: 5, leadId: 250, companyId: 7, type: "call" });
    expect(completeOpenLeadCallTasks).toHaveBeenCalledWith(expect.anything(), 250, 1, expect.any(Date));
    expect(d.task.create.mock.calls[0][0].data).toMatchObject({ leadId: 250 });
    expect(d.lead.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 250, tenantId: 1 }, data: { nextAction: "Visszahívás" } });
    expect(mk(completeOpenLeadCallTasks).mock.invocationCallOrder[0]).toBeLessThan(d.task.create.mock.invocationCallOrder[0]);
  });

  it("no campaign, no lead: company-only log as before, now with the user", async () => {
    const r = await recordCall({ companyId: 7, outcome: "note_only" });
    expect(r).toMatchObject({ success: true, newStatus: null, taskCreated: false });
    expect(d.interaction.create.mock.calls[0][0].data).toMatchObject({ userId: 5, leadId: null });
    expect(completeOpenLeadCallTasks).not.toHaveBeenCalled();
    expect(d.lead.updateMany).not.toHaveBeenCalled();
  });

  it("a bad follow-up date is refused before anything is written", async () => {
    mk(findCallableMembers).mockResolvedValue([{ memberId: 44, campaignId: 3, slug: "bp" }]);
    expect(await recordCall({ companyId: 7, outcome: "no_answer", followupDate: "nope" })).toEqual({ error: "Érvénytelen visszahívási dátum" });
    expect(recordOutcome).not.toHaveBeenCalled();
    expect(d.interaction.create).not.toHaveBeenCalled();
  });
});
