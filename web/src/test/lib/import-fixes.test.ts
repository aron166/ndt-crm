import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";

const { db } = vi.hoisted(() => ({
  db: { company: { findMany: vi.fn(), create: vi.fn() } },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { readWorkbook } from "@/lib/import/read";
import { normalizeAccountType, normalizeWarmth } from "@/lib/import/normalize";
import { buildCompanyRecord } from "@/lib/import/build";
import { runCompanyImport } from "@/lib/import/commit";

const CSV = "Cégnév,Város\nÁrvíztűrő Kft.,Győr\n";
const rowsOf = (wb: XLSX.WorkBook) =>
  XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });

describe("readWorkbook utf-8 csv", () => {
  it("decodes BOM-less UTF-8", () => {
    const rows = rowsOf(readWorkbook("x.csv", Buffer.from(CSV, "utf8")));
    expect(rows[0]).toEqual(["Cégnév", "Város"]);
    expect(rows[1][0]).toBe("Árvíztűrő Kft.");
  });
  it("decodes with a leading BOM", () => {
    const rows = rowsOf(readWorkbook("x.csv", Buffer.from("﻿" + CSV, "utf8")));
    expect(rows[0]).toEqual(["Cégnév", "Város"]);
  });
  it("handles uppercase .CSV", () => {
    const rows = rowsOf(readWorkbook("X.CSV", Buffer.from(CSV, "utf8")));
    expect(rows[0]).toEqual(["Cégnév", "Város"]);
  });
  it("documents the bug: raw XLSX.read mangles BOM-less UTF-8", () => {
    const wb = XLSX.read(Buffer.from(CSV, "utf8"), { type: "buffer" });
    expect(rowsOf(wb)[0][0]).not.toBe("Cégnév");
  });
});

describe("enum normalizers", () => {
  it.each([
    ["prospect", "Prospect"], ["PROSPECT", "Prospect"], ["Ügyfél", "Customer"],
    ["ugyfel", "Customer"], ["szállító", "Vendor"], ["Lead", "Lead"],
  ])("accountType %s", (i, o) => expect(normalizeAccountType(i)).toBe(o));
  it.each([
    ["Hideg", "cold"], ["langyos", "warm"], ["FORRÓ", "hot"], ["hot", "hot"],
  ])("warmth %s", (i, o) => expect(normalizeWarmth(i)).toBe(o));
  it("blank -> null, unknown -> undefined", () => {
    expect(normalizeAccountType("  ")).toBeNull();
    expect(normalizeWarmth("")).toBeNull();
    expect(normalizeAccountType("maybe")).toBeUndefined();
    expect(normalizeWarmth("maybe")).toBeUndefined();
  });
});

describe("buildCompanyRecord enums", () => {
  it("maps accountType and warmth", () => {
    const r = buildCompanyRecord({ name: "A Kft", accountType: "prospect", warmth: "Forró" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.accountType).toBe("Prospect");
      expect(r.record.warmth).toBe("hot");
    }
  });
  it.each([{ accountType: "valami" }, { warmth: "valami" }, { status: "valami" }])(
    "rejects unknown %o",
    (extra) => {
      const r = buildCompanyRecord({ name: "A Kft", ...extra });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/^Ismeretlen/);
    },
  );
  it("accepts status Működő as active", () => {
    const r = buildCompanyRecord({ name: "A Kft", status: "Működő" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record.status).toBe("active");
  });
});

describe("runCompanyImport dry run", () => {
  it("dedupes within the file and never writes", async () => {
    db.company.findMany.mockResolvedValue([]);
    const rows = [
      { N: "Duplikált Kft." },
      { N: "duplikalt kft" },
      { N: "Más Zrt.", V: "12345678-2-41" },
      { N: "Harmadik Bt.", V: "HU12345678" },
    ];
    const res = await runCompanyImport(rows, { N: "name", V: "vatNumber" }, { dryRun: true, tenantId: 1 });
    expect(res.created).toBe(2);
    expect(res.matched).toBe(2);
    expect(db.company.create).not.toHaveBeenCalled();
  });
});
