import { describe, it, expect } from "vitest";
import { appendImportNote, buildImportNote, diffCompany } from "@/lib/import/note";

const base = { fileName: "f.csv", date: "2026-10-07" };

describe("diffCompany", () => {
  it("compares only provided fields, trimmed and case-insensitive", () => {
    const d = diffCompany(
      { warmth: "warm", city: " győr ", website: "https://x.hu", county: null, address: "  " },
      { warmth: "cold", city: "Győr", website: null, county: "Pest", address: "Fő u. 1" },
    );
    expect(d).toEqual([
      { field: "website", crm: null, file: "https://x.hu" },
      { field: "warmth", crm: "cold", file: "warm" },
    ]);
  });
});

describe("buildImportNote", () => {
  it("lists diffs", () => {
    const n = buildImportNote({ ...base, diffs: [
      { field: "warmth", crm: "cold", file: "warm" },
      { field: "website", crm: null, file: "https://x.hu" },
    ] });
    expect(n).toBe("[Import 2026-10-07, f.csv] Eltérő mezők: warmth (CRM: cold, fájl: warm); website (CRM: -, fájl: https://x.hu)");
  });
  it("adds row notes on a next line", () => {
    const n = buildImportNote({ ...base, diffs: [{ field: "city", crm: "A", file: "B" }], rowNotes: " hello " });
    expect(n?.split("\n")[1]).toBe("Megjegyzés a fájlból: hello");
  });
  it("row notes only", () => {
    expect(buildImportNote({ ...base, diffs: [], rowNotes: "x" })).toBe("[Import 2026-10-07, f.csv]\nMegjegyzés a fájlból: x");
  });
  it("nothing to add -> null", () => {
    expect(buildImportNote({ ...base, diffs: [], rowNotes: "  " })).toBeNull();
    expect(buildImportNote({ ...base, diffs: [] })).toBeNull();
  });
});

describe("appendImportNote", () => {
  it("null or blank existing -> block only", () => {
    expect(appendImportNote(null, "B")).toBe("B");
    expect(appendImportNote("  ", "B")).toBe("B");
  });
  it("appends with a blank line", () => expect(appendImportNote("old", "B")).toBe("old\n\nB"));
  it("skips when already present", () => expect(appendImportNote("old\n\nB", "B")).toBeNull());
});
