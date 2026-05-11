import { describe, it, expect } from "vitest";
import { validateInteractionInput } from "@/app/actions/interactions";

describe("validateInteractionInput", () => {
  const valid = {
    type: "call",
    notes: "Érdeklődő, visszahív hétfőn.",
    occurredAt: "2026-05-12T10:00",
  };

  it("returns null for valid input", () => {
    expect(validateInteractionInput(valid)).toBeNull();
  });

  it("requires type", () => {
    expect(validateInteractionInput({ ...valid, type: "" })).toBe(
      "Típus kötelező"
    );
    expect(validateInteractionInput({ ...valid, type: undefined })).toBe(
      "Típus kötelező"
    );
  });

  it("requires notes", () => {
    expect(validateInteractionInput({ ...valid, notes: "" })).toBe(
      "Megjegyzés kötelező"
    );
    expect(validateInteractionInput({ ...valid, notes: "   " })).toBe(
      "Megjegyzés kötelező"
    );
  });

  it("requires occurredAt", () => {
    expect(validateInteractionInput({ ...valid, occurredAt: "" })).toBe(
      "Dátum kötelező"
    );
    expect(validateInteractionInput({ ...valid, occurredAt: undefined })).toBe(
      "Dátum kötelező"
    );
  });

  it("accepts optional direction and outcome", () => {
    expect(
      validateInteractionInput({ ...valid, direction: "inbound", outcome: "interested" })
    ).toBeNull();
  });
});
