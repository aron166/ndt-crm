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

describe("diffCompany provided/normalized", () => {
  it("skips fields not provided in the raw row", () => {
    expect(diffCompany({ status: "active" }, { status: "fa" }, {})).toEqual([]);
    expect(diffCompany({ status: "active" }, { status: "fa" }, { status: "active" })).toHaveLength(1);
  });
  it("normalizes VAT and website on both sides", () => {
    expect(diffCompany(
      { vatNumber: "12345678-2-41", website: "https://x.hu" },
      { vatNumber: "12345678241", website: "HTTPS://X.hu/path" },
    )).toEqual([]);
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
describe("appendImportNote idempotency across days", () => {
  it("same block on another day appends nothing", () => {
    const a = "[Import 2026-10-07, f.csv] Eltérő mezők: city (CRM: A, fájl: B)";
    const b = a.replace("2026-10-07", "2026-10-09");
    expect(appendImportNote(`old\n\n${a}`, b)).toBeNull();
  });
});
