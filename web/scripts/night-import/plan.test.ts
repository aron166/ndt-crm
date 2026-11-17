// @vitest-environment node
import { describe, expect, it } from "vitest";
import { planNightImport, type ARow, type BRow } from "./plan";

const sup = (emails: string[] = [], domains: string[] = []) => ({ emails: new Set(emails), domains: new Set(domains) });
const a = (o: Partial<ARow>): ARow => ({
  firm_name: "Alfa Kft", tax_number: "11111111", city: "Budapest", domain: "alfa.hu", our_segment: "contractor", fit: "A",
  email: "kiss.janos@alfa.hu", email_class: "personal", person_name_clean: "Kiss János", person_role: "ügyvezető",
  phone_direct: null, person_relevance: 1, source_url: "https://alfa.hu/kapcsolat", quote: "Kiss János ügyvezető", ...o,
});
const b = (o: Partial<BRow>): BRow => ({
  firm_name: "Béta Zrt", tax_number: null, city: "Győr", domain: "beta.hu", segment: "fm_owner", tier: "A",
  person_name: "Nagy Éva", person_role: "műszaki vezető", email: "nagy.eva@beta.hu", email_class: "personal", phone_direct: null,
  source_url: "https://ted.europa.eu/x", why_now: "Tender for a car park repair", why_now_url: "https://ted.europa.eu/n/1", ...o,
});
const fit = (m: Record<string, string>) => new Map(Object.entries(m).map(([e, f]) => [e, { fit: f, warm: false }]));

describe("planNightImport", () => {
  it("dedupes: one member per company, the other named person and the role mailbox become extras", () => {
    const p = planNightImport([
      a({ email: "info@alfa.hu", email_class: "role", person_name_clean: null, person_relevance: 0 }),
      a({ email: "szabo.anna@alfa.hu", person_name_clean: "Szabó Anna", person_relevance: 2 }),
      a({}),
    ], [], { fit: new Map(), opener: new Map(), suppressions: sup() });
    const c = p.campaigns["night-contractor"];
    expect(c.members).toHaveLength(1);
    expect(c.members[0].email).toBe("kiss.janos@alfa.hu"); // relevance 1 named wins over 2 and the role box
    expect(c.extras.map((x) => x.email).sort()).toEqual(["info@alfa.hu", "szabo.anna@alfa.hu"]);
  });

  it("a firm with no named person loads its role mailbox as the member", () => {
    const p = planNightImport([a({ email: "info@alfa.hu", email_class: "role", person_name_clean: null })], [], { fit: new Map(), opener: new Map(), suppressions: sup() });
    expect(p.campaigns["night-contractor"].members[0].email).toBe("info@alfa.hu");
    expect(p.campaigns["night-contractor"].members[0].person_name).toBeUndefined();
  });

  it("never loads a suppressed address or domain, and counts it", () => {
    const p = planNightImport([a({}), a({ firm_name: "Gamma Kft", tax_number: "22222222", email: "x@gamma.hu" })], [],
      { fit: new Map(), opener: new Map(), suppressions: sup(["kiss.janos@alfa.hu"], ["gamma.hu"]) });
    expect(p.campaigns["night-contractor"].members).toHaveLength(0);
    expect(p.campaigns["night-contractor"].extras).toHaveLength(0);
    expect(p.skipped.suppressed).toBe(2);
  });

  it("one campaign per person: input B wins over A for the same e-mail", () => {
    const p = planNightImport([a({ email: "nagy.eva@beta.hu" })], [b({})], { fit: fit({ "nagy.eva@beta.hu": "high" }), opener: new Map(), suppressions: sup() });
    expect(p.campaigns["night-tender"].members.map((m) => m.email)).toEqual(["nagy.eva@beta.hu"]);
    expect(p.campaigns["night-contractor"].members).toHaveLength(0);
    expect(p.skipped.duplicate_email).toBe(1);
  });

  it("tender filter: only tier A/B, fit high or mid, not a warm account; the rest is skipped with a reason", () => {
    const rows = [b({}), b({ email: "c@beta.hu", tier: "C" }), b({ email: "low@beta.hu" }), b({ email: "warm@beta.hu" }), b({ email: "norate@beta.hu" }), b({ email: null })];
    const f = fit({ "nagy.eva@beta.hu": "mid", "c@beta.hu": "high", "low@beta.hu": "low" });
    f.set("warm@beta.hu", { fit: "high", warm: true });
    const p = planNightImport([], rows, { fit: f, opener: new Map([["nagy.eva@beta.hu", "Láttuk a tendert"]]), suppressions: sup() });
    const all = [...p.campaigns["night-tender"].members, ...p.campaigns["night-tender"].extras];
    expect(all.map((m) => m.email)).toEqual(["nagy.eva@beta.hu"]);
    expect(all[0].why).toContain("[mid]");
    expect(all[0].why).toContain("Láttuk a tendert");
    expect(all[0].source).toContain("https://ted.europa.eu/n/1");
    expect(p.skipped).toMatchObject({ b_tier_c: 1, b_fit_low: 1, b_warm_account: 1, b_unrated: 1, b_no_email: 1 });
  });

  it("skips invalid e-mails, no-MX rows and off-target rows", () => {
    const p = planNightImport([a({ email: "nincs" }), a({ email: "x@y.hu", mx_ok: false }), a({ email: "z@y.hu", off_target: true })], [],
      { fit: new Map(), opener: new Map(), suppressions: sup() });
    expect(p.campaigns["night-contractor"].members).toHaveLength(0);
    expect(p.skipped).toMatchObject({ invalid_email: 1, no_mx: 1, off_target: 1 });
  });

  it("flags named-person addresses in contact_source and maps the segment to its audience", () => {
    const p = planNightImport([a({ our_segment: "precast" })], [], { fit: new Map(), opener: new Map(), suppressions: sup() });
    const m = p.campaigns["night-other"].members[0];
    expect(m.contact_source).toMatch(/^personal: https:\/\/alfa\.hu/);
    expect(m.segment).toBe("precast");
  });
});
