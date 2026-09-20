import { describe, it, expect } from "vitest";
import {
  shouldLogInteractionOnComplete,
  shouldPromptLeadStageOnComplete,
  taskTypeToInteractionType,
} from "./interactions";

// Which prompt a completed task raises. Pure, so both surfaces that tick a task
// (useTaskCompletion, and the Kanban's drag-to-done) are pinned by one test.

describe("shouldPromptLeadStageOnComplete", () => {
  // The tasks are written out as whole rows, `type` included, on purpose: the
  // rule deliberately ignores the type now, and a future gate on it would turn
  // these red rather than pass unnoticed.
  const callback = { id: 1, leadId: 7, type: "call", companyId: 3, personId: 4 };
  const demoBooking = { id: 2, leadId: 7, type: "meeting", companyId: 3, personId: 4 };
  const writeOffer = { id: 3, leadId: 7, type: "document", companyId: 3, personId: 4 };
  const internal = { id: 4, leadId: null, type: "internal", companyId: 3, personId: null };

  it("asks on a lead callback task", () => {
    expect(shouldPromptLeadStageOnComplete(callback)).toBe(true);
  });

  it("asks on the lead's DEMO booking, which is a meeting task, not a call", () => {
    // The regression this pins: the booking task logLeadCallOutcome creates has
    // type "meeting". While the rule was gated on type === "call", ticking the
    // demo off asked nothing, so the lead sat in demo_aron forever.
    expect(shouldPromptLeadStageOnComplete(demoBooking)).toBe(true);
    expect(shouldPromptLeadStageOnComplete(writeOffer)).toBe(true);
  });

  it("stays silent on a task that serves no lead", () => {
    expect(shouldPromptLeadStageOnComplete(internal)).toBe(false);
    expect(shouldPromptLeadStageOnComplete({ leadId: null })).toBe(false);
    expect(shouldPromptLeadStageOnComplete({})).toBe(false);
  });
});

describe("shouldLogInteractionOnComplete", () => {
  it("offers the interaction log for a comms task with a subject", () => {
    expect(shouldLogInteractionOnComplete({ type: "call", companyId: 1, personId: null })).toBe(true);
    expect(shouldLogInteractionOnComplete({ type: "field_visit", companyId: null, personId: 2 })).toBe(true);
  });

  it("does not offer it without a subject, or for a non-comms type", () => {
    expect(shouldLogInteractionOnComplete({ type: "call", companyId: null, personId: null })).toBe(false);
    expect(shouldLogInteractionOnComplete({ type: "internal", companyId: 1, personId: null })).toBe(false);
    expect(shouldLogInteractionOnComplete({ type: null, companyId: 1, personId: null })).toBe(false);
  });
});

describe("taskTypeToInteractionType", () => {
  it("maps the four communication task types and nothing else", () => {
    expect(taskTypeToInteractionType("field_visit")).toBe("site_visit");
    expect(taskTypeToInteractionType("document")).toBeNull();
    expect(taskTypeToInteractionType(null)).toBeNull();
  });
});
