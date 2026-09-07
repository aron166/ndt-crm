import { describe, it, expect } from "vitest";
import {
  normalizeName,
  stripLegalSuffix,
  normalizeVat,
  normalizeWebsite,
  splitFullName,
  normalizeCompanyStatus,
} from "@/lib/import/normalize";
import { guessMapping } from "@/lib/import/fields";
import { mapRowValues, buildCompanyRecord, buildPersonRecord } from "@/lib/import/build";

describe("normalize", () => {
  it("normalizeName strips accents, case, punctuation", () => {
    expect(normalizeName("Árvíztűrő Kft.")).toBe("arvizturo kft");
    expect(normalizeName("  ACME—Corp  ")).toBe("acme corp");
    expect(normalizeName(null)).toBe("");
  });

  it("stripLegalSuffix drops trailing legal forms", () => {
    expect(stripLegalSuffix("acme kft")).toBe("acme");
    expect(stripLegalSuffix("nagy es tarsa zrt")).toBe("nagy es tarsa");
    expect(stripLegalSuffix("kft")).toBe("kft"); // never strip to empty
  });

  it("normalizeVat reduces to the 8-digit core", () => {
    expect(normalizeVat("12345678-2-41")).toBe("12345678");
    expect(normalizeVat("HU12345678")).toBe("12345678");
    expect(normalizeVat("123")).toBeNull();
    expect(normalizeVat("")).toBeNull();
  });

  it("normalizeWebsite canonicalizes to https host", () => {
    expect(normalizeWebsite("acme.hu")).toBe("https://acme.hu");
    expect(normalizeWebsite("http://www.acme.hu/path")).toBe("http://www.acme.hu");
    expect(normalizeWebsite("not a url")).toBeNull();
    expect(normalizeWebsite("")).toBeNull();
  });

  it("splitFullName uses Hungarian last-name-first order", () => {
    expect(splitFullName("Kovács Béla")).toEqual({ firstName: "Béla", lastName: "Kovács" });
    expect(splitFullName("Nagy")).toEqual({ firstName: "Nagy", lastName: null });
    expect(splitFullName("Szabó János Péter")).toEqual({ firstName: "János Péter", lastName: "Szabó" });
    expect(splitFullName("")).toEqual({ firstName: null, lastName: null });
  });

  it("normalizeCompanyStatus flags dissolved entities", () => {
    expect(normalizeCompanyStatus("F.A.")).toEqual({ status: "F.A.", dissolved: true });
    expect(normalizeCompanyStatus("felszámolás alatt")).toEqual({ status: "F.A.", dissolved: true });
    expect(normalizeCompanyStatus("inaktív")).toEqual({ status: "inactive", dissolved: true });
    expect(normalizeCompanyStatus("aktív")).toEqual({ status: "active", dissolved: false });
    expect(normalizeCompanyStatus("")).toEqual({ status: "active", dissolved: false });
  });
});

describe("guessMapping", () => {
  it("auto-maps Hungarian company headers", () => {
    const m = guessMapping(["Cégnév", "Adószám", "Város", "Ismeretlen"], "company");
    expect(m["Cégnév"]).toBe("name");
    expect(m["Adószám"]).toBe("vatNumber");
    expect(m["Város"]).toBe("city");
    expect(m["Ismeretlen"]).toBe("");
  });

  it("never assigns one field to two columns", () => {
    const m = guessMapping(["Név", "Cégnév"], "company");
    const assigned = Object.values(m).filter((v) => v === "name");
    expect(assigned).toHaveLength(1);
  });

  it("maps person headers including company link", () => {
    const m = guessMapping(["Vezetéknév", "Keresztnév", "E-mail", "Cég"], "person");
    expect(m["Vezetéknév"]).toBe("lastName");
    expect(m["Keresztnév"]).toBe("firstName");
    expect(m["E-mail"]).toBe("email");
    expect(m["Cég"]).toBe("companyName");
  });
});

describe("mapRowValues", () => {
  it("inverts column→field into field→trimmed value, dropping blanks", () => {
    const row = { "Cégnév": "  Acme Kft  ", "Adószám": "12345678", "Üres": "" };
    const mapping = { "Cégnév": "name", "Adószám": "vatNumber", "Üres": "notes", "Nincs": "" };
    expect(mapRowValues(row, mapping)).toEqual({ name: "Acme Kft", vatNumber: "12345678" });
  });
});

describe("buildCompanyRecord", () => {
  it("builds a normalized record", () => {
    const r = buildCompanyRecord({ name: "Acme Kft", vatNumber: "12345678-2-41", website: "acme.hu", city: "Budapest" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.name).toBe("Acme Kft");
      expect(r.record.vatNumber).toBe("12345678");
      expect(r.record.website).toBe("https://acme.hu");
      expect(r.skip).toBeUndefined();
    }
  });

  it("errors when the name is missing", () => {
    const r = buildCompanyRecord({ city: "Budapest" });
    expect(r.ok).toBe(false);
  });

  it("flags dissolved companies for skipping", () => {
    const r = buildCompanyRecord({ name: "Dead Kft", status: "F.A." });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.skip?.reason).toBeTruthy();
  });
});

describe("buildPersonRecord", () => {
  it("uses explicit first/last when given", () => {
    const r = buildPersonRecord({ firstName: "Béla", lastName: "Kovács", email: "b@acme.hu", companyName: "Acme" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record).toMatchObject({ firstName: "Béla", lastName: "Kovács", email: "b@acme.hu", companyName: "Acme" });
    }
  });

  it("splits fullName when no separate name columns", () => {
    const r = buildPersonRecord({ fullName: "Kovács Béla" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record).toMatchObject({ firstName: "Béla", lastName: "Kovács" });
  });

  it("errors when there is no name at all", () => {
    const r = buildPersonRecord({ email: "x@y.hu" });
    expect(r.ok).toBe(false);
  });
});
