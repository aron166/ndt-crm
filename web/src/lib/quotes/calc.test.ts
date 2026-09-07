import { describe, it, expect } from "vitest";
import { lineAmount, netTotal, quoteTotals, subtotalsByCode } from "./calc";

describe("lineAmount", () => {
  it("multiplies quantity by unit rate", () => {
    expect(lineAmount({ quantity: 3, unitRate: 1000 })).toBe(3000);
  });
  it("rounds to whole HUF", () => {
    expect(lineAmount({ quantity: 1.5, unitRate: 333 })).toBe(500); // 499.5 → 500
  });
  it("is 0 when quantity or rate is missing", () => {
    expect(lineAmount({ quantity: 5, unitRate: null })).toBe(0);
    expect(lineAmount({ quantity: null, unitRate: 1000 })).toBe(0);
    expect(lineAmount({})).toBe(0);
  });
});

describe("netTotal", () => {
  it("sums billable lines and ignores incomplete ones", () => {
    const net = netTotal([
      { quantity: 2, unitRate: 5000 }, // 10000
      { quantity: 1, unitRate: 3000 }, // 3000
      { description: "free note", quantity: null, unitRate: null }, // 0
    ]);
    expect(net).toBe(13000);
  });
  it("is 0 for an empty quote", () => {
    expect(netTotal([])).toBe(0);
  });
});

describe("quoteTotals", () => {
  it("applies the Hungarian 27% VAT", () => {
    const t = quoteTotals([{ quantity: 1, unitRate: 100000 }], 27);
    expect(t).toEqual({ net: 100000, vat: 27000, gross: 127000 });
  });
  it("rounds VAT to whole HUF", () => {
    const t = quoteTotals([{ quantity: 1, unitRate: 333 }], 27);
    expect(t.vat).toBe(90); // 89.91 → 90
    expect(t.gross).toBe(423);
  });
  it("treats a 0 / invalid rate as no VAT", () => {
    expect(quoteTotals([{ quantity: 1, unitRate: 1000 }], 0).vat).toBe(0);
    expect(quoteTotals([{ quantity: 1, unitRate: 1000 }], Number.NaN).vat).toBe(0);
  });
});

describe("subtotalsByCode", () => {
  it("groups line amounts by cost code in first-seen order", () => {
    const rows = subtotalsByCode([
      { costCode: "KID", quantity: 10, unitRate: 200 }, // 2000
      { costCode: "SZD", quantity: 2, unitRate: 5000 }, // 10000
      { costCode: "KID", quantity: 5, unitRate: 200 }, // 1000 → KID total 3000
    ]);
    expect(rows).toEqual([
      { code: "KID", amount: 3000 },
      { code: "SZD", amount: 10000 },
    ]);
  });
  it("buckets code-less lines under empty string", () => {
    expect(subtotalsByCode([{ description: "x", quantity: 1, unitRate: 100 }])).toEqual([
      { code: "", amount: 100 },
    ]);
  });
});
