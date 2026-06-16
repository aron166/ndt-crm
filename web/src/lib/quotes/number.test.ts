import { describe, it, expect } from "vitest";
import { formatQuoteNumber, parseQuoteSeq, nextQuoteNumber } from "./number";

describe("formatQuoteNumber", () => {
  it("zero-pads the sequence to 4 digits", () => {
    expect(formatQuoteNumber(2026, 1)).toBe("AJ-2026-0001");
    expect(formatQuoteNumber(2026, 42)).toBe("AJ-2026-0042");
  });
  it("does not truncate sequences beyond 4 digits", () => {
    expect(formatQuoteNumber(2026, 12345)).toBe("AJ-2026-12345");
  });
});

describe("parseQuoteSeq", () => {
  it("extracts the sequence for the matching year", () => {
    expect(parseQuoteSeq("AJ-2026-0007", 2026)).toBe(7);
  });
  it("returns null for a different year or bad shape", () => {
    expect(parseQuoteSeq("AJ-2025-0007", 2026)).toBeNull();
    expect(parseQuoteSeq("INV-2026-0007", 2026)).toBeNull();
    expect(parseQuoteSeq("AJ-2026-abc", 2026)).toBeNull();
  });
});

describe("nextQuoteNumber", () => {
  it("starts at 0001 when nothing exists for the year", () => {
    expect(nextQuoteNumber([], 2026)).toBe("AJ-2026-0001");
  });
  it("is max-for-year + 1, ignoring other years and gaps", () => {
    const existing = ["AJ-2026-0001", "AJ-2026-0003", "AJ-2025-0099"];
    expect(nextQuoteNumber(existing, 2026)).toBe("AJ-2026-0004");
  });
  it("ignores numbers from other years entirely", () => {
    expect(nextQuoteNumber(["AJ-2025-0050"], 2026)).toBe("AJ-2026-0001");
  });
});
