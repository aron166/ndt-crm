import { describe, it, expect } from "vitest";
import { isPlaceholderText, displayScriptLabel } from "./placeholder";

describe("isPlaceholderText", () => {
  it("true for TODO seed text, any case, leading space", () => {
    expect(isPlaceholderText("TODO: A változat")).toBe(true);
    expect(isPlaceholderText("  todo: x")).toBe(true);
  });
  it("false for real text", () => {
    expect(isPlaceholderText("Jó napot kívánok")).toBe(false);
  });
  it("false for empty or nullish", () => {
    expect(isPlaceholderText("")).toBe(false);
    expect(isPlaceholderText(null)).toBe(false);
    expect(isPlaceholderText(undefined)).toBe(false);
  });
});

describe("displayScriptLabel", () => {
  it("strips the TODO prefix so A and B stay distinct", () => {
    expect(displayScriptLabel("TODO: A változat (kérdéssel nyit)")).toBe("A változat (kérdéssel nyit)");
    expect(displayScriptLabel("todo B változat")).toBe("B változat");
  });
  it("returns real labels unchanged", () => {
    expect(displayScriptLabel("Rövid nyitás")).toBe("Rövid nyitás");
  });
});
