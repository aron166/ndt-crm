import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const getActor = vi.fn();
vi.mock("@/lib/actor", () => ({ getActor: (...a: unknown[]) => getActor(...a), NOT_A_CRM_USER: "not a CRM user" }));
const svc = vi.hoisted(() => ({
  createCampaign: vi.fn(), setSteps: vi.fn(), updateCampaign: vi.fn(), getCampaign: vi.fn(), addMembers: vi.fn(),
  undoBatch: vi.fn(), approveCampaign: vi.fn(), setCampaignStatus: vi.fn(), recordOutcome: vi.fn(),
}));
vi.mock("@/lib/campaigns/service", () => svc);

import * as A from "@/app/actions/campaign-hub";

beforeEach(() => vi.clearAllMocks());

const calls: [string, () => Promise<unknown>][] = [
  ["create", () => A.createCampaignAction({ name: "x", kind: "sequence" })],
  ["steps", () => A.saveStepsAction("bp", [{ channel: "email" }])],
  ["update", () => A.updateCampaignAction("bp", { name: "y" })],
  ["adopt", () => A.adoptProposedStepsAction("bp")],
  ["load", () => A.loadMembersAction("bp", { fileText: "[]", batch: "b", dryRun: true })],
  ["undo", () => A.undoBatchAction("bp", "b", true)],
  ["approve", () => A.approveCampaignAction("bp", "0000000000000000000000000000000000000000000000000000000000000000")],
  ["status", () => A.setCampaignStatusAction("bp", "paused")],
  ["outcome", () => A.recordCampaignOutcomeAction("bp", { member_id: 1, outcome: "no_answer" })],
];

describe("campaign hub actions: a CRM user first", () => {
  it.each(calls)("%s refuses without a CRM user and never reaches the service", async (_n, call) => {
    getActor.mockResolvedValue({ userId: null });
    expect(await call()).toEqual({ error: "not a CRM user" });
    for (const f of Object.values(svc)) expect(f).not.toHaveBeenCalled();
  });
});

describe("role checks pass through from the service with the session user", () => {
  beforeEach(() => getActor.mockResolvedValue({ userId: 5 }));
  it("approve: another user gets the service's 403 text", async () => {
    svc.approveCampaign.mockResolvedValue({ error: "Kampányt csak Áron indíthat", status: 403 });
    expect(await A.approveCampaignAction("bp", "0000000000000000000000000000000000000000000000000000000000000000")).toEqual({ error: "Kampányt csak Áron indíthat" });
    expect(svc.approveCampaign).toHaveBeenCalledWith({ tenantId: 1, userId: 5 }, "bp", { hash: "0000000000000000000000000000000000000000000000000000000000000000" });
  });
  it("approve without a valid seen hash never reaches the service", async () => {
    expect(await A.approveCampaignAction("bp", "nope")).toHaveProperty("error");
    expect(svc.approveCampaign).not.toHaveBeenCalled();
  });
  it("apply and undo go to the service as the session user, never as a key", async () => {
    svc.addMembers.mockResolvedValue({ error: "Ehhez admin vagy manager szerep kell", status: 403 });
    const r = await A.loadMembersAction("bp", { fileText: JSON.stringify([{ company_name: "A" }]), batch: "b1", dryRun: false });
    expect(r).toEqual({ error: "Ehhez admin vagy manager szerep kell" });
    expect(svc.addMembers).toHaveBeenCalledWith({ tenantId: 1, userId: 5 }, "bp", expect.objectContaining({ dry_run: false }));
    svc.undoBatch.mockResolvedValue({ error: "Ehhez admin vagy manager szerep kell", status: 403 });
    expect(await A.undoBatchAction("bp", "b1", false)).toEqual({ error: "Ehhez admin vagy manager szerep kell" });
    expect(svc.undoBatch).toHaveBeenCalledWith({ tenantId: 1, userId: 5 }, "bp", "b1", false);
  });
  it("adopting proposed steps ties each proposed asset to its step position", async () => {
    svc.getCampaign.mockResolvedValue({ briefProposal: { steps: [{ channel: "email" }, { channel: "call", wait_days: 3 }], assets: [{ item_id: 41, step_position: 2 }] } });
    svc.setSteps.mockResolvedValue({ ok: true, status: "draft" });
    expect(await A.adoptProposedStepsAction("bp")).toEqual({ ok: true });
    expect(svc.setSteps.mock.calls[0][2]).toEqual([
      expect.objectContaining({ channel: "email", content_item_id: null }),
      expect.objectContaining({ channel: "call", wait_days: 3, content_item_id: 41 }),
    ]);
  });
  it("a load defaults to a dry run unless dryRun is exactly false", async () => {
    svc.addMembers.mockResolvedValue({ ok: true, dry_run: true, summary: {} });
    await A.loadMembersAction("bp", { fileText: JSON.stringify([{ company_name: "A" }]), batch: "b1" } as never);
    expect(svc.addMembers.mock.calls[0][2].dry_run).toBe(true);
  });
});
