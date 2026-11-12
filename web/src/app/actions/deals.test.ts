import { describe, it, expect, vi, beforeEach } from "vitest";

// Deal stage (inventory 3.D): the board drag (moveDeal) and the modal "Fázis" select
// (updateDeal) must have the same three effects: stage clock, deal_stage_changed, audit detail.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/actor", () => ({ requireCrmUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/automations/engine", () => ({ runAutomations: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/app/actions/companies", () => ({ deleteCompany: vi.fn() }));
vi.mock("@/app/actions/persons", () => ({ deletePerson: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    deal: { findFirst: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn() },
    pipelineStage: { findFirst: vi.fn() },
    person: { findFirst: vi.fn() },
    company: { findFirst: vi.fn() },
    pipeline: { findFirst: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { runAutomations } from "@/lib/automations/engine";
import { requireCrmUser } from "@/lib/actor";
import { moveDeal, updateDeal } from "./deals";

type M = ReturnType<typeof vi.fn>;
const d = db as unknown as Record<string, Record<string, M>>;
const DEAL = {
  title: "Régi", stageId: 1, pipelineId: 9, companyId: 7, personId: null, value: null, customFields: {},
  stage: { name: "A" }, company: { name: "Acme" },
};

function form(over: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ title: "Új cím", value: "", expectedCloseDate: "", personId: "", stageId: "1", ...over })) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireCrmUser as unknown as M).mockResolvedValue(null);
  d.deal.findFirst.mockResolvedValue(DEAL);
  d.deal.updateMany.mockResolvedValue({ count: 1 });
  d.deal.aggregate.mockResolvedValue({ _max: { position: 4 } });
  d.pipelineStage.findFirst.mockResolvedValue({ id: 2, name: "B", pipelineId: 9 });
});

/** The three effects of a real stage change, whichever control made it. */
function expectStageChangeEffects() {
  const stageWrite = d.deal.updateMany.mock.calls.map((c) => c[0].data).find((x) => x.stageId === 2);
  expect(stageWrite?.stageEnteredAt).toBeInstanceOf(Date);
  expect(runAutomations).toHaveBeenCalledWith(expect.objectContaining({ type: "deal_stage_changed", dealId: 5, toStageId: 2 }));
  expect(audit).toHaveBeenCalledWith("deal", 5, "update", expect.objectContaining({ stageId: 1 }), expect.objectContaining({ stageId: 2, stageName: "B" }), undefined);
}

describe("deal stage change: one path for the board and the modal", () => {
  it("board drag (moveDeal): clock, automation, audit", async () => {
    await moveDeal(5, 2, 0);
    expectStageChangeEffects();
  });

  it("modal 'Fázis' select (updateDeal): the same three effects, and the other fields are saved", async () => {
    expect(await updateDeal(5, form({ stageId: "2" }))).toEqual({ success: true });
    expectStageChangeEffects();
    expect(d.deal.updateMany.mock.calls[0][0].data).toMatchObject({ title: "Új cím" });
    expect(runAutomations).toHaveBeenCalledTimes(1);
  });

  it("a modal save that keeps the stage fires nothing and leaves the clock", async () => {
    expect(await updateDeal(5, form({ stageId: "1" }))).toEqual({ success: true });
    expect(runAutomations).not.toHaveBeenCalled();
    for (const c of d.deal.updateMany.mock.calls) expect(c[0].data.stageEnteredAt).toBeUndefined();
  });

  it("a modal save with no stage chosen keeps the old behaviour (stage cleared, nothing fired)", async () => {
    expect(await updateDeal(5, form({ stageId: "" }))).toEqual({ success: true });
    expect(d.deal.updateMany.mock.calls[0][0].data.stageId).toBeNull();
    expect(runAutomations).not.toHaveBeenCalled();
  });

  it("a stage of another tenant is refused before anything is written", async () => {
    d.pipelineStage.findFirst.mockResolvedValue(null);
    expect(await updateDeal(5, form({ stageId: "99" }))).toMatchObject({ error: expect.any(String) });
    expect(d.deal.updateMany).not.toHaveBeenCalled();
    expect(runAutomations).not.toHaveBeenCalled();
  });

  it("a modal save with a bad stageId leaves the deal unchanged (validated before any write)", async () => {
    d.pipelineStage.findFirst.mockResolvedValue(null);
    expect(await updateDeal(5, form({ stageId: "2", title: "Más" }))).toEqual({ error: "Szakasz nem található" });
    expect(d.deal.updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("a deal that is gone writes nothing and says so", async () => {
    d.deal.findFirst.mockResolvedValue(null);
    expect(await updateDeal(5, form({ stageId: "2" }))).toEqual({ error: "Deal nem található" });
    expect(d.deal.updateMany).not.toHaveBeenCalled();
    expect(runAutomations).not.toHaveBeenCalled();
  });

  it("a stage of another pipeline moves the deal into that pipeline, as a board drag does", async () => {
    d.pipelineStage.findFirst.mockResolvedValue({ id: 2, name: "B", pipelineId: 11 });
    expect(await updateDeal(5, form({ stageId: "2" }))).toEqual({ success: true });
    expect(d.deal.updateMany.mock.calls.map((c) => c[0].data).find((x) => x.stageId === 2)).toMatchObject({ pipelineId: 11 });
  });

  it("not a CRM user: refused", async () => {
    (requireCrmUser as unknown as M).mockResolvedValue("NOT_A_CRM_USER");
    expect(await updateDeal(5, form({ stageId: "2" }))).toEqual({ error: "NOT_A_CRM_USER" });
    expect(d.deal.updateMany).not.toHaveBeenCalled();
  });
});
