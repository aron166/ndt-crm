import { describe, it, expect } from "vitest";
import {
  completionPromptsFor,
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

describe("completionPromptsFor", () => {
  it("shows the stage prompt only for a lead-linked call", () => {
    const call = { id: 1, leadId: 7, type: "call", companyId: 3, personId: null };
    expect(completionPromptsFor(call)).toEqual(["stage"]);
  });

  it("shows the log modal, then the stage modal, for a lead-linked email/meeting/field_visit", () => {
    const email = { id: 2, leadId: 7, type: "email", companyId: 3, personId: null };
    const meeting = { id: 3, leadId: 7, type: "meeting", companyId: 3, personId: null };
    const fieldVisit = { id: 4, leadId: 7, type: "field_visit", companyId: 3, personId: null };
    expect(completionPromptsFor(email)).toEqual(["log", "stage"]);
    expect(completionPromptsFor(meeting)).toEqual(["log", "stage"]);
    expect(completionPromptsFor(fieldVisit)).toEqual(["log", "stage"]);
  });

  it("shows the stage prompt only for a lead-linked non-loggable task", () => {
    const document = { id: 5, leadId: 7, type: "document", companyId: 3, personId: null };
    const internal = { id: 6, leadId: 7, type: "internal", companyId: 3, personId: null };
    const untyped = { id: 7, leadId: 7, type: null, companyId: 3, personId: null };
    expect(completionPromptsFor(document)).toEqual(["stage"]);
    expect(completionPromptsFor(internal)).toEqual(["stage"]);
    expect(completionPromptsFor(untyped)).toEqual(["stage"]);
  });

  it("falls back to the plain log-or-nothing rule when there is no lead", () => {
    const noLeadCall = { id: 8, leadId: null, type: "call", companyId: 3, personId: null };
    const noLeadInternal = { id: 9, leadId: null, type: "internal", companyId: 3, personId: null };
    expect(completionPromptsFor(noLeadCall)).toEqual(["log"]);
    expect(completionPromptsFor(noLeadInternal)).toEqual([]);
  });
});

describe("taskTypeToInteractionType", () => {
  it("maps the four communication task types and nothing else", () => {
    expect(taskTypeToInteractionType("field_visit")).toBe("site_visit");
    expect(taskTypeToInteractionType("document")).toBeNull();
    expect(taskTypeToInteractionType(null)).toBeNull();
  });
});
