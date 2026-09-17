import { describe, it, expect } from "vitest";
import { wordDiff, type DiffPart } from "./diff";

function reconstructAfter(parts: DiffPart[]): string {
  return parts
    .filter((p) => p.type === "same" || p.type === "add")
    .map((p) => p.text)
    .join("");
}

function reconstructBefore(parts: DiffPart[]): string {
  return parts
    .filter((p) => p.type === "same" || p.type === "del")
    .map((p) => p.text)
    .join("");
}

describe("wordDiff", () => {
  it("identical strings produce a single same part", () => {
    const parts = wordDiff("hello world", "hello world");
    expect(parts).toEqual([{ type: "same", text: "hello world" }]);
  });

  it("detects an insertion", () => {
    const parts = wordDiff("hello world", "hello brave world");
    expect(parts.some((p) => p.type === "add" && p.text.includes("brave"))).toBe(true);
    expect(reconstructAfter(parts)).toBe("hello brave world");
    expect(reconstructBefore(parts)).toBe("hello world");
  });

  it("detects a deletion", () => {
    const parts = wordDiff("hello brave world", "hello world");
    expect(parts.some((p) => p.type === "del" && p.text.includes("brave"))).toBe(true);
    expect(reconstructAfter(parts)).toBe("hello world");
    expect(reconstructBefore(parts)).toBe("hello brave world");
  });

  it("shows a replacement as del+add", () => {
    const parts = wordDiff("the cat sat", "the dog sat");
    const types = parts.map((p) => p.type);
    expect(types).toContain("del");
    expect(types).toContain("add");
    expect(reconstructBefore(parts)).toBe("the cat sat");
    expect(reconstructAfter(parts)).toBe("the dog sat");
  });

  it("holds reconstruction invariants on Hungarian text with accents", () => {
    const before =
      "Az árvíztűrő tükörfúrógép egy különleges szerkezet, amelyet Kőszegen gyártanak.\n\nMásodik bekezdés következik itt.";
    const after =
      "Az árvíztűrő tükörfúrógép egy modern szerkezet, amelyet Szombathelyen gyártanak most.\n\nMásodik bekezdés következik itt, kiegészítve.";
    const parts = wordDiff(before, after);
    expect(reconstructBefore(parts)).toBe(before);
    expect(reconstructAfter(parts)).toBe(after);
  });

  it("holds reconstruction invariants on a second Hungarian sample", () => {
    const before = "Kérjük, ellenőrizze a mérési jegyzőkönyvet, mielőtt aláírja azt!";
    const after = "Kérjük, alaposan ellenőrizze a mérési jegyzőkönyvet, mielőtt jóváhagyja azt!";
    const parts = wordDiff(before, after);
    expect(reconstructBefore(parts)).toBe(before);
    expect(reconstructAfter(parts)).toBe(after);
  });

  it("falls back for very large inputs, staying under 1s and preserving invariants", () => {
    const beforeWords = Array.from({ length: 20000 }, (_, i) => `word${i}`).join(" ");
    const afterWords = Array.from({ length: 20000 }, (_, i) => (i % 500 === 0 ? `changed${i}` : `word${i}`)).join(" ");
    const start = Date.now();
    const parts = wordDiff(beforeWords, afterWords);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(reconstructBefore(parts)).toBe(beforeWords);
    expect(reconstructAfter(parts)).toBe(afterWords);
  });
});
