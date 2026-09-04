import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  triggerMatches, conditionsPass, renderTemplate, buildCreateTaskData, runAutomations,
  auditRuleTask, runLeadAction,
} from "./engine";
import type { AutomationEvent, CreateTaskActionConfig } from "./types";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    automationRule: { findMany: vi.fn(), update: vi.fn() },
    task: { create: vi.fn() },
    company: { findFirst: vi.fn() },
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
    company: { findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockDb.company.findFirst.mockResolvedValue(null); // no enrichment by default
  });

  function dbRule(over: Record<string, unknown> = {}) {
    return {
      id: 1, triggerType: "lead_created", triggerConfig: null, conditions: null,
      actionType: "create_task", actionConfig: { titleTemplate: "Feladat {company}" },
      ...over,
    };
  }

  // CodeRabbit (#61): the task row is already committed when auditRuleTask runs.
  // If auditing blew up it aborted the rule before `lastRunAt` was stamped.
  it("a failing audit does not abort the rule after the task is committed", async () => {
    mockDb.automationRule.findMany.mockResolvedValue([dbRule({ id: 1 })]);
    mockDb.task.create.mockResolvedValue({ id: 99 });
    mockDb.automationRule.update.mockResolvedValue({});
    vi.mocked(audit).mockImplementationOnce(() => { throw new Error("audit down"); });

    await runAutomations(leadCreated());

    expect(mockDb.task.create).toHaveBeenCalledTimes(1);
    expect(mockDb.automationRule.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
  });

  it("auditRuleTask swallows and reports an audit failure", async () => {
    vi.mocked(audit).mockImplementationOnce(() => { throw new Error("audit down"); });
    await expect(
      auditRuleTask(99, { tenantId: 1, title: "x" } as never, 1, 1),
    ).resolves.toBeUndefined();
  });

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

  it("enriches conditions with the company's attributes (company_* fields)", async () => {
    mockDb.company.findFirst.mockResolvedValue({
      warmth: "hot", county: "Pest", city: "Budapest",
      pipelineStatus: "5", industryCode: "C", teaorCode: "2511",
    });
    mockDb.automationRule.findMany.mockResolvedValue([
      dbRule({ id: 1, conditions: [{ field: "company_warmth", op: "eq", value: "hot" }] }),
      dbRule({ id: 2, conditions: [{ field: "company_warmth", op: "eq", value: "cold" }] }),
    ]);
    mockDb.task.create.mockResolvedValue({ id: 1 });
    mockDb.automationRule.update.mockResolvedValue({});

    await runAutomations(leadCreated());

    // Only the rule targeting hot companies fires.
    expect(mockDb.task.create).toHaveBeenCalledTimes(1);
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

describe("runLeadAction / runAutomationAction (v2 actions)", () => {
  const mockDb = db as unknown as { automationRule: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }; company: { findFirst: ReturnType<typeof vi.fn> } };
  beforeEach(() => { vi.clearAllMocks(); mockDb.company.findFirst.mockResolvedValue(null); });

  it("webhook_out POSTs the event JSON and fires; non-http URL is a no-op", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
    const ev = leadCreated({ leadId: 5 });
    expect(await runLeadAction("webhook_out", { url: "https://n8n.local/hook" }, ev)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://n8n.local/hook");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({ event: "lead_created", leadId: 5, company: "Acme Kft." });
    expect(await runLeadAction("webhook_out", { url: "ftp://x" }, ev)).toBe(false);
    fetchMock.mockRestore();
  });

  it("webhook_out throws on a non-2xx so the rule is reported, not stamped", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(runLeadAction("webhook_out", { url: "https://x.y/z" }, leadCreated())).rejects.toThrow("webhook_out 500");
    fetchMock.mockRestore();
  });

  it("lead actions are no-ops without a leadId", async () => {
    expect(await runLeadAction("change_lead_status", { toStatus: "call_1" }, leadCreated({ leadId: null }))).toBe(false);
    expect(await runLeadAction("assign_lead", { assignedToId: 2 }, leadCreated())).toBe(false);
  });

  it("orchestrator stamps lastRunAt only when a v2 action actually fired", async () => {
    mockDb.automationRule.findMany.mockResolvedValue([
      { id: 7, triggerType: "lead_created", triggerConfig: null, conditions: null, actionType: "webhook_out", actionConfig: { url: "nope" } },
    ]);
    await runAutomations(leadCreated({ leadId: 1 }));
    expect(mockDb.automationRule.update).not.toHaveBeenCalled();
  });
});
