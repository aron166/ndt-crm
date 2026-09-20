import { describe, it, expect } from "vitest";
import { foldTechnologyWords } from "./technology-words";

describe("foldTechnologyWords", () => {
  it("merges case-insensitively, summing counts", () => {
    const d1 = new Date("2026-01-01");
    const d2 = new Date("2026-02-01");
    const rows = [
      { technologyWord: "Ultrahang", count: 3, lastUsedAt: d1 },
      { technologyWord: "ultrahang", count: 2, lastUsedAt: d2 },
    ];
    const result = foldTechnologyWords(rows);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(5);
  });

  it("keeps the most frequent original spelling as the display word", () => {
    const d = new Date("2026-01-01");
    const rows = [
      { technologyWord: "ultrahang", count: 1, lastUsedAt: d },
      { technologyWord: "Ultrahang", count: 5, lastUsedAt: d },
    ];
    const result = foldTechnologyWords(rows);
    expect(result[0].word).toBe("Ultrahang");
    expect(result[0].count).toBe(6);
  });

  it("breaks a tie in frequency by the most recently used spelling", () => {
    const older = new Date("2026-01-01");
    const newer = new Date("2026-03-01");
    const rows = [
      { technologyWord: "roncsolásmentes", count: 2, lastUsedAt: older },
      { technologyWord: "Roncsolásmentes", count: 2, lastUsedAt: newer },
    ];
    const result = foldTechnologyWords(rows);
    expect(result[0].word).toBe("Roncsolásmentes");
    expect(result[0].lastUsedAt).toEqual(newer);
  });

  it("trims whitespace before folding", () => {
    const d = new Date("2026-01-01");
    const rows = [
      { technologyWord: "  betonszkennelés  ", count: 1, lastUsedAt: d },
      { technologyWord: "betonszkennelés", count: 1, lastUsedAt: d },
    ];
    const result = foldTechnologyWords(rows);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
  });

  it("drops null and blank rows", () => {
    const d = new Date("2026-01-01");
    const rows = [
      { technologyWord: null, count: 4, lastUsedAt: d },
      { technologyWord: "   ", count: 1, lastUsedAt: d },
      { technologyWord: "falvastagságmérés", count: 1, lastUsedAt: d },
    ];
    const result = foldTechnologyWords(rows);
    expect(result).toHaveLength(1);
    expect(result[0].word).toBe("falvastagságmérés");
  });

  it("sorts by count descending, then word ascending", () => {
    const d = new Date("2026-01-01");
    const rows = [
      { technologyWord: "beton", count: 2, lastUsedAt: d },
      { technologyWord: "anyagvizsgálat", count: 5, lastUsedAt: d },
      { technologyWord: "zaj", count: 2, lastUsedAt: d },
    ];
    const result = foldTechnologyWords(rows);
    expect(result.map((r) => r.word)).toEqual(["anyagvizsgálat", "beton", "zaj"]);
  });
});
