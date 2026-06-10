import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  triggerMatches, conditionsPass, renderTemplate, buildCreateTaskData, runAutomations,
} from "./engine";
import type { AutomationEvent, CreateTaskActionConfig } from "./types";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    automationRule: { findMany: vi.fn(), update: vi.fn() },
    task: { create: vi.fn() },
  },
}));

function leadCreated(over: Partial<AutomationEvent> = {}): AutomationEvent {
  return {
    type: "lead_created",
    tenantId: 1,
    companyId: 10,
    personId: 20,
    companyName: "Acme Kft.",
    fields: { company: "Acme Kft.", source: "web", message: "Hello", sourceApp: "betonscan_landing" },
    ...over,
  };
}

describe("triggerMatches", () => {
  it("lead_created matches any rule of that type", () => {
    expect(triggerMatches("lead_created", null, leadCreated())).toBe(true);
  });

  it("type mismatch never matches", () => {
    expect(triggerMatches("deal_stage_changed", null, leadCreated())).toBe(false);
  });

  it("lead_status_changed honours toStatus config", () => {
    const ev = leadCreated({ type: "lead_status_changed", toStatus: "qualified" });
    expect(triggerMatches("lead_status_changed", { toStatus: "qualified" }, ev)).toBe(true);
    expect(triggerMatches("lead_status_changed", { toStatus: "nurture" }, ev)).toBe(false);
    // Empty config = any status change.
    expect(triggerMatches("lead_status_changed", {}, ev)).toBe(true);
  });

  it("deal_stage_changed honours toStageId config", () => {
    const ev = leadCreated({ type: "deal_stage_changed", toStageId: 3 });
    expect(triggerMatches("deal_stage_changed", { toStageId: 3 }, ev)).toBe(true);
    expect(triggerMatches("deal_stage_changed", { toStageId: 9 }, ev)).toBe(false);
    expect(triggerMatches("deal_stage_changed", null, ev)).toBe(true);
  });

  it("deal_idle_in_stage is never event-driven (handled by the scheduler)", () => {
    const ev = leadCreated({ type: "deal_idle_in_stage" });
    expect(triggerMatches("deal_idle_in_stage", { idleDays: 7 }, ev)).toBe(false);
  });
});

describe("conditionsPass", () => {
  const fields = { source: "web", estimatedValue: 1_500_000, serviceInterest: "" };

  it("null/empty conditions always pass", () => {
    expect(conditionsPass(null, fields)).toBe(true);
    expect(conditionsPass([], fields)).toBe(true);
  });

  it("eq / ne compare as strings", () => {
    expect(conditionsPass([{ field: "source", op: "eq", value: "web" }], fields)).toBe(true);
    expect(conditionsPass([{ field: "source", op: "ne", value: "email" }], fields)).toBe(true);
    expect(conditionsPass([{ field: "source", op: "eq", value: "email" }], fields)).toBe(false);
  });

  it("gt / lt compare numerically (incl. numeric strings)", () => {
    expect(conditionsPass([{ field: "estimatedValue", op: "gt", value: "1000000" }], fields)).toBe(true);
    expect(conditionsPass([{ field: "estimatedValue", op: "lt", value: 1_000_000 }], fields)).toBe(false);
  });

  it("contains is case-insensitive", () => {
    expect(conditionsPass([{ field: "source", op: "contains", value: "WE" }], fields)).toBe(true);
  });

  it("is_empty / is_not_empty", () => {
    expect(conditionsPass([{ field: "serviceInterest", op: "is_empty" }], fields)).toBe(true);
    expect(conditionsPass([{ field: "source", op: "is_not_empty" }], fields)).toBe(true);
  });

  it("AND-s multiple conditions", () => {
    expect(conditionsPass([
      { field: "source", op: "eq", value: "web" },
      { field: "estimatedValue", op: "gt", value: 1_000_000 },
    ], fields)).toBe(true);
    expect(conditionsPass([
      { field: "source", op: "eq", value: "web" },
      { field: "estimatedValue", op: "lt", value: 1_000_000 },
    ], fields)).toBe(false);
  });
});

describe("renderTemplate", () => {
  it("substitutes {company} and field tokens", () => {
    expect(renderTemplate("Lead megkeresése: {company}", leadCreated())).toBe("Lead megkeresése: Acme Kft.");
  });

  it("drops unknown/empty tokens and collapses whitespace", () => {
    const ev = leadCreated({ companyName: "Acme", fields: { company: "Acme", sourceApp: "web", message: "" } });
    expect(renderTemplate("Új lead a(z) {sourceApp} csatornán. {message}", ev)).toBe("Új lead a(z) web csatornán.");
  });

  it("preserves newlines for email bodies when collapseWhitespace is false", () => {
    const ev = leadCreated({ companyName: "Acme", fields: { company: "Acme" } });
    const body = "Tisztelt {company}!\n\nKöszönjük az érdeklődést.\n\nÜdv";
    expect(renderTemplate(body, ev, false)).toBe("Tisztelt Acme!\n\nKöszönjük az érdeklődést.\n\nÜdv");
  });
});

describe("buildCreateTaskData", () => {
  it("renders title/description and computes due date from offset", () => {
    const cfg: CreateTaskActionConfig = {
      titleTemplate: "Lead megkeresése: {company}",
      type: "call", category: "revenue_generating", dueInDays: 1,
      descriptionTemplate: "Forrás: {sourceApp}",
    };
    const now = new Date("2026-06-07T10:00:00.000Z");
    const data = buildCreateTaskData(cfg, leadCreated(), now);
    expect(data.title).toBe("Lead megkeresése: Acme Kft.");
    expect(data.description).toBe("Forrás: betonscan_landing");
    expect(data.type).toBe("call");
    expect(data.status).toBe("created");
    expect(data.companyId).toBe(10);
    expect(data.personId).toBe(20);
    expect((data.dueDate as Date).toISOString()).toBe("2026-06-08T10:00:00.000Z");
  });

  it("leaves dueDate null when no offset is configured", () => {
    const data = buildCreateTaskData({ titleTemplate: "x" }, leadCreated());
    expect(data.dueDate).toBeNull();
    expect(data.description).toBeNull();
  });
});

describe("runAutomations (orchestrator)", () => {
  const mockDb = db as unknown as {
    automationRule: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    task: { create: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  function dbRule(over: Record<string, unknown> = {}) {
    return {
      id: 1, triggerType: "lead_created", triggerConfig: null, conditions: null,
      actionType: "create_task", actionConfig: { titleTemplate: "Feladat {company}" },
      ...over,
    };
  }

  it("isolates a failing rule and still runs the rest", async () => {
    mockDb.automationRule.findMany.mockResolvedValue([dbRule({ id: 1 }), dbRule({ id: 2 })]);
    mockDb.task.create
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ id: 99 });
    mockDb.automationRule.update.mockResolvedValue({});

    await runAutomations(leadCreated());

    expect(mockDb.task.create).toHaveBeenCalledTimes(2); // both attempted
    expect(mockDb.automationRule.update).toHaveBeenCalledTimes(1); // only the one that succeeded stamps lastRunAt
  });

  it("only fires rules whose trigger config matches", async () => {
    mockDb.automationRule.findMany.mockResolvedValue([
      dbRule({ id: 1, triggerType: "lead_status_changed", triggerConfig: { toStatus: "qualified" } }),
      dbRule({ id: 2, triggerType: "lead_status_changed", triggerConfig: { toStatus: "nurture" } }),
    ]);
    mockDb.task.create.mockResolvedValue({ id: 1 });
    mockDb.automationRule.update.mockResolvedValue({});

    await runAutomations(leadCreated({ type: "lead_status_changed", toStatus: "qualified" }));

    expect(mockDb.task.create).toHaveBeenCalledTimes(1);
    expect(mockDb.automationRule.update).toHaveBeenCalledWith({
      where: { id: 1 }, data: { lastRunAt: expect.any(Date) },
    });
  });

  it("skips rules whose conditions do not pass", async () => {
    mockDb.automationRule.findMany.mockResolvedValue([
      dbRule({ id: 1, conditions: [{ field: "source", op: "eq", value: "email" }] }),
    ]);
    await runAutomations(leadCreated()); // source is "web" → condition fails
    expect(mockDb.task.create).not.toHaveBeenCalled();
  });

  it("never throws even if the rule query fails", async () => {
    mockDb.automationRule.findMany.mockRejectedValue(new Error("db down"));
    await expect(runAutomations(leadCreated())).resolves.toBeUndefined();
  });
});
