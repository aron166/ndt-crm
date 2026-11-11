import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { runAutomations } from "@/lib/automations/engine";
import { customFieldError, moveDealToStage, patchDealCustomFields } from "./service";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/automations/engine", () => ({ runAutomations: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db", () => ({
  db: {
    deal: { findFirst: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn() },
    pipelineStage: { findFirst: vi.fn() },
  },
}));

type M = ReturnType<typeof vi.fn>;
const d = db as unknown as { deal: { findFirst: M; updateMany: M; aggregate: M }; pipelineStage: { findFirst: M } };
const DEAL = { stageId: 1, pipelineId: 9, companyId: 7, personId: null, value: null, stage: { name: "A" }, company: { name: "Acme" } };

beforeEach(() => {
  vi.clearAllMocks();
  d.deal.findFirst.mockResolvedValue(DEAL);
  d.deal.updateMany.mockResolvedValue({ count: 1 });
  d.deal.aggregate.mockResolvedValue({ _max: { position: 4 } });
});

describe("moveDealToStage", () => {
  it("moves within the pipeline, appends to the stage, resets the clock, fires the automation", async () => {
    d.pipelineStage.findFirst.mockResolvedValue({ name: "B", pipelineId: 9 });
    expect(await moveDealToStage(1, 5, 2, { samePipeline: true })).toEqual({ success: true, changed: true });
    expect(d.deal.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 5, tenantId: 1 }, data: { stageId: 2, position: 5, pipelineId: 9 } });
    expect(d.deal.updateMany.mock.calls[0][0].data.stageEnteredAt).toBeInstanceOf(Date);
    expect(runAutomations).toHaveBeenCalledTimes(1);
  });

  it("refuses a stage of another pipeline for API callers and writes nothing", async () => {
    d.pipelineStage.findFirst.mockResolvedValue({ name: "X", pipelineId: 3 });
    expect(await moveDealToStage(1, 5, 2, { samePipeline: true })).toHaveProperty("error");
    expect(d.deal.updateMany).not.toHaveBeenCalled();
  });

  it("scopes both lookups to the tenant", async () => {
    d.pipelineStage.findFirst.mockResolvedValue(null);
    expect(await moveDealToStage(1, 5, 2)).toEqual({ error: "Szakasz nem található" });
    expect(d.deal.findFirst.mock.calls[0][0].where).toEqual({ id: 5, tenantId: 1 });
    expect(d.pipelineStage.findFirst.mock.calls[0][0].where).toEqual({ id: 2, pipeline: { tenantId: 1 } });
  });

  it("a reorder within the same stage keeps the clock and fires nothing", async () => {
    d.pipelineStage.findFirst.mockResolvedValue({ name: "A", pipelineId: 9 });
    expect(await moveDealToStage(1, 5, 1, { position: 0 })).toEqual({ success: true, changed: false });
    expect(d.deal.updateMany.mock.calls[0][0].data.stageEnteredAt).toBeUndefined();
    expect(runAutomations).not.toHaveBeenCalled();
  });
});

describe("patchDealCustomFields", () => {
  const FIELDS = [
    { key: "offer_sent_at", type: "date", options: null },
    { key: "demo_moments", type: "multi_select", options: ["a", "b"] },
  ];
  beforeEach(() => {
    d.deal.findFirst.mockResolvedValue({ customFields: { fromLeadId: 3, saleKind: "machine", demo_moments: "a" }, pipeline: { customFields: FIELDS } });
  });

  it("merges, deletes on null, keeps the system keys", async () => {
    expect(await patchDealCustomFields(1, 5, { offer_sent_at: "2026-11-20", demo_moments: null })).toEqual({ success: true });
    expect(d.deal.updateMany.mock.calls[0][0].data.customFields).toEqual({ fromLeadId: 3, saleKind: "machine", offer_sent_at: "2026-11-20" });
  });

  it("refuses a key the pipeline does not define, including the system keys", async () => {
    expect(await patchDealCustomFields(1, 5, { saleKind: "scan" })).toEqual({ error: "Ismeretlen mező: saleKind" });
    expect(d.deal.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a value of the wrong type", async () => {
    expect(await patchDealCustomFields(1, 5, { offer_sent_at: "holnap" })).toHaveProperty("error");
    expect(await patchDealCustomFields(1, 5, { demo_moments: "a,c" })).toHaveProperty("error");
    expect(d.deal.updateMany).not.toHaveBeenCalled();
  });
});

describe("customFieldError", () => {
  it.each([
    ["number", "12", null], ["number", "1.5", null], ["number", "sok", "x: szám kell"],
    ["date", "2026-11-20", null], ["date", "2026-02-30", "x: dátum kell (ÉÉÉÉ-HH-NN)"], ["date", "2026-13-01", "x: dátum kell (ÉÉÉÉ-HH-NN)"],
    ["single_select", "a", null], ["single_select", "z", "x: ismeretlen opció"], ["text", "bármi", null],
  ])("%s %s", (type, value, expected) => {
    expect(customFieldError({ key: "x", type, options: ["a"] }, value)).toBe(expected);
  });
});

describe("Vanda #185 follow-ups", () => {
  it("customFieldsFromForm joins a multi_select's ticked boxes under the bare key", async () => {
    const { customFieldsFromForm } = await import("./service");
    const fd = new FormData();
    fd.append("title", "x");
    fd.append("cf_demo_moments[]", "a");
    fd.append("cf_demo_moments[]", "b");
    fd.append("cf_offer_sent_at", "2026-11-20");
    fd.append("cf_empty", "  ");
    expect(customFieldsFromForm(fd)).toEqual({ demo_moments: "a,b", offer_sent_at: "2026-11-20" });
  });

  it("dealStageError refuses another pipeline's stage, allows any for a legacy deal without one", async () => {
    const { dealStageError } = await import("./service");
    d.deal.findFirst.mockResolvedValueOnce({ pipelineId: 9 });
    d.pipelineStage.findFirst.mockResolvedValueOnce({ pipelineId: 3 });
    expect(await dealStageError(1, 5, 2)).toBe("A szakasz másik pipeline-hoz tartozik");
    d.deal.findFirst.mockResolvedValueOnce({ pipelineId: null });
    d.pipelineStage.findFirst.mockResolvedValueOnce({ pipelineId: 3 });
    expect(await dealStageError(1, 5, 2)).toBeNull();
  });
});
