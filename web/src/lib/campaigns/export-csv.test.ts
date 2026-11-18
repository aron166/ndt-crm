import { describe, it, expect } from "vitest";
import { EXPORT_COLUMNS, exportRow, toCsv, type ExportMember } from "./export-csv";

const M: ExportMember = { email: "a@b.hu", firstName: "Éva", lastName: "Kovács", company: "Építő Kft.", why: null, segment: null, contactSource: null, source: null };

describe("export csv", () => {
  it("header order is fixed", () => {
    expect(EXPORT_COLUMNS.join(",")).toBe("email,first_name,last_name,company_name,opener,segment,tender,source_url");
    expect(toCsv([]).replace("﻿", "").split("\r\n")[0]).toBe(EXPORT_COLUMNS.join(","));
  });
  it("splits the tender tag from the opener", () => {
    const r = exportRow({ ...M, why: "[high] Azért írok..." });
    expect(r.opener).toBe("Azért írok...");
    expect(r.tender).toBe("high");
    expect(exportRow({ ...M, why: "[mid]  x " }).tender).toBe("mid");
  });
  it("other why gives empty opener and tender", () => {
    const r = exportRow({ ...M, why: "[fit B] x@y.hu" });
    expect(r.opener).toBe("");
    expect(r.tender).toBe("");
  });
  it("source_url comes from contactSource, then source", () => {
    expect(exportRow({ ...M, contactSource: "personal: https://eloszer.hu/kapcsolat" }).source_url).toBe("https://eloszer.hu/kapcsolat");
    expect(exportRow({ ...M, contactSource: "role: http://www.epkar.hu/" }).source_url).toBe("http://www.epkar.hu/");
    expect(exportRow({ ...M, source: 'see "https://x.hu/a" ok' }).source_url).toBe("https://x.hu/a");
    expect(exportRow(M).source_url).toBe("");
  });
  it("company mailbox has empty names", () => {
    const r = exportRow({ ...M, firstName: null, lastName: null, segment: null });
    expect(r.email).toBe("a@b.hu");
    expect(r.first_name).toBe("");
    expect(r.last_name).toBe("");
    expect(r.segment).toBe("");
  });
  it("neutralises formula injection", () => {
    expect(toCsv([{ ...M, company: '=HYPERLINK("http://x")' }])).toContain(`"'=HYPERLINK(""http://x"")"`);
  });
  it("quotes commas and doubles quotes", () => {
    expect(toCsv([{ ...M, why: '[high] Szia, "világ"' }])).toContain('"Szia, ""világ"""');
  });
  it("has BOM, CRLF and keeps accents", () => {
    const c = toCsv([M]);
    expect(c.startsWith("﻿")).toBe(true);
    expect(c.split("\r\n")).toHaveLength(3);
    expect(c).toContain("Éva,Kovács,Építő Kft.");
  });
});
