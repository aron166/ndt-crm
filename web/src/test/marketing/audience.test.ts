import { describe, it, expect } from "vitest";
import {
  companiesToCsv, audienceFileName, type AudienceCompany,
} from "@/lib/marketing/audience";

const row = (over: Partial<AudienceCompany>): AudienceCompany => ({
  name: "Acme Kft.", vatNumber: "12345678-2-01", city: "Budapest", county: "Pest",
  website: "acme.hu", pipelineStatus: "3", warmth: "warm", teaorCode: "2511", ...over,
});

describe("companiesToCsv", () => {
  it("emits a header row and CRLF-joined data rows", () => {
    const csv = companiesToCsv([row({})]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Cégnév,Adószám,Város,Megye,Weboldal,Pipeline,Hőfok,TEÁOR");
    expect(lines[1]).toBe("Acme Kft.,12345678-2-01,Budapest,Pest,acme.hu,3,warm,2511");
    expect(lines).toHaveLength(2);
  });

  it("renders nulls as empty cells", () => {
    const csv = companiesToCsv([row({ vatNumber: null, county: null, website: null, warmth: null })]);
    expect(csv.split("\r\n")[1]).toBe("Acme Kft.,,Budapest,,,3,,2511");
  });

  it("quotes and escapes values containing comma, quote, or newline", () => {
    const csv = companiesToCsv([row({ name: 'Foo, "Bar"\nBaz', city: "x,y" })]);
    const dataLine = csv.split("\r\n").slice(1).join("\r\n");
    expect(dataLine).toContain('"Foo, ""Bar""\nBaz"');
    expect(dataLine).toContain('"x,y"');
  });

  it("header-only when there are no rows", () => {
    expect(companiesToCsv([])).toBe("Cégnév,Adószám,Város,Megye,Weboldal,Pipeline,Hőfok,TEÁOR");
  });
});

describe("audienceFileName", () => {
  it("strips accents and slugifies", () => {
    expect(audienceFileName("Q3 NDT Outreach")).toBe("q3-ndt-outreach-celkozonseg.csv");
    expect(audienceFileName("Árvíztűrő tükörfúrógép")).toBe("arvizturo-tukorfurogep-celkozonseg.csv");
  });

  it("falls back to 'kampany' for an empty/symbol-only name", () => {
    expect(audienceFileName("!!!")).toBe("kampany-celkozonseg.csv");
  });
});
