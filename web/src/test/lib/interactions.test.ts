import { describe, it, expect } from "vitest";
import {
  interactionTypeLabel,
  interactionDirectionLabel,
  taskTypeToInteractionType,
  shouldLogInteractionOnComplete,
} from "@/lib/interactions";

describe("interactionTypeLabel", () => {
  it("returns Hungarian label for known types", () => {
    expect(interactionTypeLabel("call")).toBe("Telefonhívás");
    expect(interactionTypeLabel("email")).toBe("Email");
    expect(interactionTypeLabel("meeting")).toBe("Találkozó");
    expect(interactionTypeLabel("site_visit")).toBe("Helyszíni látogatás");
    expect(interactionTypeLabel("note")).toBe("Megjegyzés");
  });

  it("returns Ismeretlen for null", () => {
    expect(interactionTypeLabel(null)).toBe("Ismeretlen");
  });

  it("returns the raw value for unknown types", () => {
    expect(interactionTypeLabel("custom_type")).toBe("custom_type");
  });
});

describe("interactionDirectionLabel", () => {
  it("returns Hungarian label for known directions", () => {
    expect(interactionDirectionLabel("outbound")).toBe("Kimenő");
    expect(interactionDirectionLabel("inbound")).toBe("Bejövő");
  });

  it("returns empty string for null", () => {
    expect(interactionDirectionLabel(null)).toBe("");
  });
});

describe("taskTypeToInteractionType", () => {
  it("maps communication task types to interaction types", () => {
    expect(taskTypeToInteractionType("call")).toBe("call");
    expect(taskTypeToInteractionType("email")).toBe("email");
    expect(taskTypeToInteractionType("meeting")).toBe("meeting");
    expect(taskTypeToInteractionType("field_visit")).toBe("site_visit");
  });

  it("returns null for non-communication task types", () => {
    expect(taskTypeToInteractionType("document")).toBeNull();
    expect(taskTypeToInteractionType("internal")).toBeNull();
    expect(taskTypeToInteractionType("unknown")).toBeNull();
    expect(taskTypeToInteractionType(null)).toBeNull();
  });
});

describe("shouldLogInteractionOnComplete", () => {
  it("prompts for a comms task tied to a company", () => {
    expect(
      shouldLogInteractionOnComplete({ type: "call", companyId: 5, personId: null }),
    ).toBe(true);
  });

  it("prompts for a comms task tied to a person", () => {
    expect(
      shouldLogInteractionOnComplete({ type: "field_visit", companyId: null, personId: 9 }),
    ).toBe(true);
  });

  it("does not prompt for a comms task with no subject", () => {
    expect(
      shouldLogInteractionOnComplete({ type: "call", companyId: null, personId: null }),
    ).toBe(false);
  });

  it("does not prompt for a non-comms task type", () => {
    expect(
      shouldLogInteractionOnComplete({ type: "internal", companyId: 5, personId: null }),
    ).toBe(false);
    expect(
      shouldLogInteractionOnComplete({ type: "document", companyId: 5, personId: 3 }),
    ).toBe(false);
  });

  it("does not prompt for a null task type", () => {
    expect(
      shouldLogInteractionOnComplete({ type: null, companyId: 5, personId: null }),
    ).toBe(false);
  });
});
