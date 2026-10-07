import { describe, it, expect } from "vitest";
import { isPlaceholderText } from "./placeholder";

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
