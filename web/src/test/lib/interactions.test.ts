import { describe, it, expect } from "vitest";
import {
  interactionTypeLabel,
  interactionDirectionLabel,
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
