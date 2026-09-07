import { describe, it, expect } from "vitest";
import {
  parseCompanyFilters,
  serializeCompanyFilters,
  buildScalarCompanyWhere,
  hasActiveCompanyFilters,
  activeCompanyFilterCount,
  type CompanyFilters,
} from "@/lib/companies/filters";

// Feature E2 — locks the segment filter contract: parse/serialize round-trip,
// AND-across + OR-within composition, multi-value TEÁOR via the attributes
// relation, and the FA default.

describe("parseCompanyFilters", () => {
  it("parses comma-joined multi values and scalar params", () => {
    const f = parseCompanyFilters({
      search: " acme ",
      industry: "C,F",
      teaor: "2511,2512",
      county: "Pest",
      pipeline_status: "3,5",
      tag: "outreach",
      never_contacted: "1",
      fa: "1",
    });
    expect(f.search).toBe("acme");
    expect(f.industry).toEqual(["C", "F"]);
    expect(f.teaor).toEqual(["2511", "2512"]);
    expect(f.county).toEqual(["Pest"]);
    expect(f.pipelineStatus).toEqual(["3", "5"]);
    expect(f.tags).toEqual(["outreach"]);
    expect(f.neverContacted).toBe(true);
    expect(f.includeFA).toBe(true);
  });

  it("accepts repeated params (URLSearchParams) and trims/drops blanks", () => {
    const sp = new URLSearchParams();
    sp.append("county", "Pest");
    sp.append("county", "Fejér");
    sp.append("industry", " , C , ");
    const f = parseCompanyFilters(sp);
    expect(f.county).toEqual(["Pest", "Fejér"]);
    expect(f.industry).toEqual(["C"]);
  });

  it("leaves absent groups undefined and defaults booleans to false", () => {
    const f = parseCompanyFilters({});
    expect(f.industry).toBeUndefined();
    expect(f.search).toBeUndefined();
    expect(f.neverContacted).toBe(false);
    expect(f.includeFA).toBe(false);
  });
});

describe("serializeCompanyFilters round-trips through parse", () => {
  it("re-parsing a serialized segment yields the same filters", () => {
    const original: CompanyFilters = {
      search: "acme",
      industry: ["C", "F"],
      teaor: ["2511"],
      county: ["Pest", "Fejér"],
      status: ["active"],
      accountType: ["Customer"],
      warmth: ["warm", "hot"],
      pipelineStatus: ["3"],
      tags: ["outreach"],
      neverContacted: true,
      includeFA: true,
    };
    const round = parseCompanyFilters(serializeCompanyFilters(original));
    expect(round).toEqual(original);
  });

  it("omits empty groups from the param record", () => {
    const out = serializeCompanyFilters({ industry: [], search: "", county: ["Pest"] });
    expect(out).toEqual({ county: "Pest" });
  });
});

describe("buildScalarCompanyWhere", () => {
  it("ANDs across types, ORs within (in []) and hides F.A. by default", () => {
    const where = buildScalarCompanyWhere({
      warmth: ["warm"],
      county: ["Pest", "Fejér"],
    });
    expect(where).toEqual({
      AND: [
        { county: { in: ["Pest", "Fejér"] } },
        { warmth: { in: ["warm"] } },
        { NOT: { name: { contains: "F.A." } } },
      ],
    });
  });

  it("matches a SECONDARY TEÁOR via the attributes relation (current rows only)", () => {
    const where = buildScalarCompanyWhere({ teaor: ["2511", "2512"], includeFA: true });
    expect(where).toEqual({
      AND: [
        { attributes: { some: { attrType: "teaor", validTo: null, value: { in: ["2511", "2512"] } } } },
      ],
    });
  });

  it("includeFA drops the F.A. exclusion", () => {
    const where = buildScalarCompanyWhere({ includeFA: true }) as { AND?: unknown[] };
    expect(where).toEqual({});
  });

  it("neverContacted filters to null last interaction", () => {
    const where = buildScalarCompanyWhere({ neverContacted: true, includeFA: true });
    expect(where).toEqual({ AND: [{ lastInteractionDate: null }] });
  });

  it("does NOT add a tag clause (tags are resolved by the async resolver)", () => {
    const where = JSON.stringify(buildScalarCompanyWhere({ tags: ["x"], includeFA: true }));
    expect(where).not.toContain("tag");
    expect(where).toBe("{}");
  });
});

describe("active-filter helpers", () => {
  it("hasActiveCompanyFilters ignores the FA toggle but counts real filters", () => {
    expect(hasActiveCompanyFilters({ includeFA: true })).toBe(false);
    expect(hasActiveCompanyFilters({ warmth: ["warm"] })).toBe(true);
    expect(hasActiveCompanyFilters({})).toBe(false);
  });

  it("activeCompanyFilterCount counts one per active group", () => {
    expect(activeCompanyFilterCount({ warmth: ["warm"], county: ["Pest"], search: "x" })).toBe(3);
    expect(activeCompanyFilterCount({ includeFA: true })).toBe(0);
  });
});
