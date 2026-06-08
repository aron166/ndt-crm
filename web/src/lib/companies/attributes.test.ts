import { describe, it, expect } from "vitest";
import {
  isCompanyAttrType, attrValueLabel, partitionAttrs, type AttrRow,
} from "./attributes";

const row = (over: Partial<AttrRow> & { id: number; attrType: string; value: string }): AttrRow => ({
  label: null, isPrimary: false, validFrom: "2020-01-01", validTo: null, source: null, ...over,
});

describe("company attributes helpers", () => {
  it("isCompanyAttrType guards known types", () => {
    expect(isCompanyAttrType("teaor")).toBe(true);
    expect(isCompanyAttrType("warmth")).toBe(true);
    expect(isCompanyAttrType("nope")).toBe(false);
  });

  it("attrValueLabel uses fixed enum options, else the label, else the value", () => {
    expect(attrValueLabel("warmth", "hot")).toBe("Forró");
    expect(attrValueLabel("status", "fa")).toBe("Felszámolás alatt");
    expect(attrValueLabel("teaor", "2511", "Fémszerkezet gyártása")).toBe("Fémszerkezet gyártása");
    expect(attrValueLabel("teaor", "2511")).toBe("2511");
  });

  it("partitionAttrs splits current vs history, primary first, newest history first", () => {
    const rows: AttrRow[] = [
      row({ id: 1, attrType: "teaor", value: "2511", isPrimary: true, validTo: null }),
      row({ id: 2, attrType: "teaor", value: "7112", isPrimary: false, validTo: null }),
      row({ id: 3, attrType: "teaor", value: "0000", isPrimary: false, validFrom: "2018", validTo: "2019-06-01" }),
      row({ id: 4, attrType: "teaor", value: "1111", isPrimary: false, validFrom: "2019", validTo: "2021-01-01" }),
      row({ id: 5, attrType: "warmth", value: "hot", isPrimary: true, validTo: null }),
    ];
    const { current, history } = partitionAttrs(rows, "teaor");
    expect(current.map((c) => c.id)).toEqual([1, 2]);     // primary (1) first
    expect(current[0].isPrimary).toBe(true);
    expect(history.map((h) => h.id)).toEqual([4, 3]);      // newest validTo first
  });
});
