import { describe, it, expect } from "vitest";
import { isSuppressed, normalizeDomain } from "./match";

const set = { emails: new Set(["nem@ceg.hu"]), domains: new Set(["tilos.hu"]) };

describe("isSuppressed", () => {
  it("exact address, case and whitespace insensitive", () => {
    expect(isSuppressed(" NEM@ceg.hu ", set)).toBe(true);
    expect(isSuppressed("igen@ceg.hu", set)).toBe(false);
  });
  it("whole domain and its subdomains, not lookalikes", () => {
    expect(isSuppressed("barki@tilos.hu", set)).toBe(true);
    expect(isSuppressed("x@iroda.tilos.hu", set)).toBe(true);
    expect(isSuppressed("x@nemtilos.hu", set)).toBe(false);
    expect(isSuppressed("x@tilos.hu.evil.com", set)).toBe(false);
  });
  it("missing address is not suppressed", () => {
    expect(isSuppressed(null, set)).toBe(false);
    expect(isSuppressed("", set)).toBe(false);
  });
});

describe("normalizeDomain", () => {
  it("accepts a bare domain or an address, rejects junk", () => {
    expect(normalizeDomain(" Ceg.HU ")).toBe("ceg.hu");
    expect(normalizeDomain("a@ceg.hu")).toBe("ceg.hu");
    expect(normalizeDomain("ceg")).toBeNull();
  });
});
