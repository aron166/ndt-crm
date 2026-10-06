import { describe, it, expect } from "vitest";
import { isSuppressed, normalizeDomain, normalizeEmail } from "./match";

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

describe("normalisation", () => {
  const s2 = { emails: new Set(["a@ceg.hu"]), domains: new Set<string>() };
  it.each(["Név <A@Ceg.hu>", "mailto:a@ceg.hu", "MAILTO:A@ceg.hu", "a@ceg.hu;", "a@ceg.hu.", "a+x@ceg.hu"])(
    "matches %s", (v) => expect(isSuppressed(v, s2)).toBe(true));
  it("normalizeEmail strips wrappers", () => {
    expect(normalizeEmail("<a@b.hu>")).toBe("a@b.hu");
    expect(normalizeEmail("Név <A@Ceg.hu>")).toBe("a@ceg.hu");
    expect(normalizeEmail("a@ceg.hu.;")).toBe("a@ceg.hu");
  });
  it("normalizeDomain strips wrappers", () => {
    expect(normalizeDomain("mailto:a@ceg.hu")).toBe("ceg.hu");
    expect(normalizeDomain("<@ceg.hu>")).toBe("ceg.hu");
    expect(normalizeDomain("ceg.hu.")).toBe("ceg.hu");
  });
});
