import { describe, expect, it } from "vitest";
import { gateOn as realGate } from "@/lib/outreach/template";
import { withFooter as realFooter } from "@/lib/outreach/drafts";
import { applyPlan, gateOn, isMobile, planPush, splitPerson, withFooter } from "./corvid-push.mjs";

const opts = { tenant: 1, sender: 3, campaign: "corvid-betonscan-w1" };
const CAMP = opts.campaign;

const person = (o: Record<string, unknown> = {}) => ({
  name: "Kovács János", title: "ügyvezető", role_class: "decision_maker", phone: "+36 1 234", linkedin: null,
  source: "registry", source_url: "https://src.example/a", retrieved_at: "2026-10-19T08:43:31+00:00", confidence: 0.8,
  email: "janos@example.hu", ...o,
});
const row = (o: Record<string, unknown> = {}) => ({
  workspace: "betonscan", lead_id: "L1", score: 70, kind: "contractor", company_name: "Alpha Kft.", adoszam: null, website: "https://alpha.hu",
  city: "Győr", person: person(), subject: "Tárgy", body: "Szia\n", ...o,
});
const crm = (o: Record<string, unknown> = {}) => ({
  companies: [] as any[], persons: [] as any[], contacts: [] as any[], drafts: [] as any[],
  suppression: { emails: new Set<string>(), domains: new Set<string>() }, gate: { ok: true }, footer: "Lábléc" as string | null, ...o,
});

describe("planPush workspace guard", () => {
  it("refuses any row not stamped with the betonscan workspace", () => {
    for (const ws of ["docktape", undefined, "Betonscan"]) {
      expect(() => planPush([row(), row({ lead_id: "L2", workspace: ws })], crm(), opts)).toThrow(/refusing push/);
    }
    expect(() => planPush([row()], crm(), opts)).not.toThrow();
  });
});

describe("planPush companies", () => {
  it("matches by VAT before name", () => {
    const p = planPush([row({ adoszam: "12345678-2-41", company_name: "Teljesen Más Kft." })],
      crm({ companies: [{ id: 7, name: "Alpha Kft.", vat_number: "12345678", website: null }] }), opts);
    expect(p.companies.matched.map((m: any) => m.id)).toEqual([7]);
    expect(p.companies.create).toEqual([]);
    expect(p.drafts.create[0].company_id).toBe(7);
  });
  it("matches by name key across case and legal form", () => {
    const p = planPush([row({ company_name: "Budapest Közút Zrt." })],
      crm({ companies: [{ id: 9, name: "BUDAPEST KÖZÚT ZRT", vat_number: null, website: null }] }), opts);
    expect(p.companies.matched.map((m: any) => m.id)).toEqual([9]);
  });
  it("creates with canonical Lead fields when nothing matches", () => {
    const p = planPush([row({ adoszam: "12345678-2-41" })], crm(), opts);
    expect(p.companies.create[0]).toMatchObject({
      name: "Alpha Kft.", vat_number: "12345678", account_type: "Lead", lead_source: "corvid", city: "Győr",
      notes: "Corvid lead L1, pontszám 70",
    });
    expect(p.drafts.create[0]).toMatchObject({ company_ref: p.companies.create[0].ref, status: "draft", step: 1, wave: 1, sender_user_id: 3 });
  });
  it("collapses duplicates in the input, first row wins", () => {
    const p = planPush([row(), row({ lead_id: "L2", company_name: "ALPHA KFT", person: person({ name: "Nagy Béla", email: "b@example.hu" }) })], crm(), opts);
    expect(p.companies.create).toHaveLength(1);
    expect(p.drafts.create).toHaveLength(1);
    expect(p.companies.skipped).toEqual([expect.objectContaining({ reason: "duplicate in input" })]);
  });
  it("skips a company with an open draft in another campaign", () => {
    const base = { companies: [{ id: 1, name: "Alpha Kft.", vat_number: null, website: null }] };
    for (const status of ["draft", "approved", "sending", "sent", "replied"]) {
      const p = planPush([row()], crm({ ...base, drafts: [{ company_id: 1, campaign: "other", status, step: 1, person_id: null }] }), opts);
      expect(p.companies.skipped[0].reason).toBe("open campaign");
      expect(p.drafts.create).toEqual([]);
    }
    const ok = planPush([row()], crm({ ...base, drafts: [{ company_id: 1, campaign: "other", status: "cancelled", step: 1, person_id: null }] }), opts);
    expect(ok.drafts.create).toHaveLength(1);
  });
  it("is silent about a company already drafted in our campaign", () => {
    const p = planPush([row()], crm({ companies: [{ id: 1, name: "Alpha Kft.", vat_number: null, website: null }],
      drafts: [{ company_id: 1, campaign: CAMP, status: "sent", step: 1, person_id: 5 }] }), opts);
    expect(p.already).toBe(1);
    expect(p.companies.skipped).toEqual([]);
    expect(p.drafts.create).toEqual([]);
  });
});

describe("planPush persons", () => {
  const co = [{ id: 1, name: "Alpha Kft.", vat_number: null, website: null }];
  it("matches a person by email, appends notes once, and links the contact", () => {
    const c = crm({ companies: co, persons: [{ id: 5, first_name: "János", last_name: "Kovács", email: "JANOS@example.hu", notes: "régi" }] });
    const p = planPush([row()], c, opts);
    expect(p.persons.create).toEqual([]);
    expect(p.persons.update[0].notes).toBe("régi\nCorvid: ügyvezető; forrás: registry https://src.example/a (2026-10-19)");
    expect(p.contacts.create).toHaveLength(1);
    const again = planPush([row()], crm({ ...c, persons: [{ ...c.persons[0], notes: p.persons.update[0].notes }] }), opts);
    expect(again.persons.update).toEqual([]);
  });
  it("matches by normalised name plus an existing contact to that company", () => {
    const persons = [{ id: 6, first_name: "János", last_name: "Kovács", email: "other@example.hu", notes: null }];
    const hit = planPush([row()], crm({ companies: co, persons, contacts: [{ person_id: 6, company_id: 1, role: "x" }] }), opts);
    expect(hit.persons.matched.map((m: any) => m.id)).toEqual([6]);
    expect(hit.contacts.create).toEqual([]);
    const miss = planPush([row()], crm({ companies: co, persons }), opts);
    expect(miss.persons.create).toHaveLength(1);
  });
  it("splits Hungarian names and moves honorifics to notes", () => {
    expect(splitPerson("Dr. Karámos Ákos")).toMatchObject({ first_name: "Ákos", last_name: "Karámos", honorifics: ["Dr."] });
    expect(splitPerson("Szemereyné dr. Pataki Klaudia")).toMatchObject({ first_name: "Klaudia", last_name: "Szemereyné Pataki", honorifics: ["Dr."] });
    const p = planPush([row({ person: person({ name: "Dr. Karámos Ákos" }) })], crm(), opts);
    expect(p.persons.create[0]).toMatchObject({ first_name: "Ákos", last_name: "Karámos", linkedin_url: null });
    expect(p.persons.create[0].notes).toContain("\nMegszólítás: Dr.");
  });
});

describe("planPush gates", () => {
  it("skips suppressed addresses and domains without creating anything", () => {
    for (const s of [{ emails: new Set(["janos@example.hu"]), domains: new Set<string>() }, { emails: new Set<string>(), domains: new Set(["example.hu"]) }]) {
      const p = planPush([row()], crm({ suppression: s }), opts);
      expect(p.drafts.skipped[0].reason).toBe("suppressed");
      expect(p.companies.create).toEqual([]);
      expect(p.persons.create).toEqual([]);
    }
  });
  it("skips every draft when the gate is closed", () => {
    const p = planPush([row(), row({ company_name: "Beta Kft." })], crm({ gate: { ok: false, error: "A sablon még nincs jóváhagyva: X" } }), opts);
    expect(p.drafts.create).toEqual([]);
    expect(p.drafts.skipped.map((s: any) => s.reason)).toEqual(Array(2).fill("A sablon még nincs jóváhagyva: X"));
  });
  it("skips rows without an email", () => {
    expect(planPush([row({ person: person({ email: null }) })], crm(), opts).drafts.skipped[0].reason).toBe("no email");
  });
  it("appends the footer once", () => {
    const p = planPush([row()], crm(), opts);
    expect(p.drafts.create[0].body).toBe("Szia\n\n-- \nLábléc");
  });
});

describe("dedupe beyond VAT and name", () => {
  it("same website or same person email in the input is one company", () => {
    const p = planPush([
      row({ lead_id: "A", company_name: "Fővárosi Önkormányzat", website: "https://budapest.hu/" }),
      row({ lead_id: "B", company_name: "Budapest Főváros Önkormányzata", website: "https://www.budapest.hu", person: person({ email: "x@budapest.hu" }) }),
      row({ lead_id: "C", company_name: "Zalaegerszeg MJV Önkormányzata", website: null, person: person({ email: "v@zeg.hu" }) }),
      row({ lead_id: "D", company_name: "Zalaegerszeg Megyei Jogú Város Önkormányzata", website: null, person: person({ email: "v@zeg.hu" }) }),
    ], crm(), opts);
    expect(p.companies.create.map((c: any) => c.name)).toEqual(["Fővárosi Önkormányzat", "Zalaegerszeg MJV Önkormányzata"]);
    expect(p.companies.skipped.map((s: any) => s.reason)).toEqual(["duplicate in input", "duplicate in input"]);
  });
  it("matches an existing company by website domain", () => {
    const p = planPush([row({ company_name: "Alpha Építő Zrt.", website: "https://www.alpha.hu/kapcsolat" })],
      crm({ companies: [{ id: 5, name: "ALFA KFT.", vat_number: null, website: "alpha.hu" }] }), opts);
    expect(p.companies.matched.map((c: any) => c.id)).toEqual([5]);
  });
  it("a name-key prefix without VAT is a possible duplicate: skipped, never created", () => {
    const p = planPush([row({ company_name: "TERRA-21. Közmű és Mélyépítő Kft.", website: "https://terra21.hu/" })],
      crm({ companies: [{ id: 1170, name: "TERRA-21. KFT.", vat_number: null, website: null }] }), opts);
    expect(p.companies.create).toEqual([]);
    expect(p.companies.skipped[0].reason).toMatch(/possible duplicate of company 1170/);
  });
});

describe("Vanda pass: never touch a person or VAT the CRM already owns elsewhere", () => {
  it("a person with an open draft at another company is skipped, and nothing is planned for the row", () => {
    const p = planPush([row()], crm({
      persons: [{ id: 50, first_name: "János", last_name: "Kovács", email: person().email, notes: null }],
      drafts: [{ company_id: 999, campaign: "cold-email-v0", status: "sent", step: 1, person_id: 50, to_email: person().email }],
    }), opts);
    expect(p.drafts.skipped.map((s: any) => s.reason)).toEqual(["person in open campaign"]);
    expect([p.companies.create, p.persons.create, p.contacts.create, p.drafts.create]).toEqual([[], [], [], []]);
  });
  it("a VAT that only lives on a deleted company is skipped, not inserted into the unique index", () => {
    const p = planPush([row({ adoszam: "12345678-2-41" })], crm({ deletedVats: ["12345678241"] }), opts);
    expect(p.companies.skipped[0].reason).toBe("VAT on a deleted company");
    expect(p.companies.create).toEqual([]);
  });
  it("a name match with a different VAT is not the same company", () => {
    const p = planPush([row({ adoszam: "11111111-2-41" })], crm({ companies: [{ id: 7, name: "Alpha Kft.", vat_number: "22222222", website: null }] }), opts);
    expect(p.companies.skipped[0].reason).toMatch(/VAT differs/);
  });
  it("near-duplicate names inside the input become one company", () => {
    const p = planPush([
      row({ lead_id: "A", company_name: "TERRA-21 Kft.", website: null, person: person({ email: "a@t.hu" }) }),
      row({ lead_id: "B", company_name: "TERRA-21 Közmű Kft.", website: null, person: person({ email: "b@t.hu" }) }),
    ], crm(), opts);
    expect(p.companies.create).toHaveLength(1);
    expect(p.companies.skipped[0].reason).toMatch(/possible duplicate/);
  });
});

describe("rerun", () => {
  it("creates nothing once the first plan is in the CRM", () => {
    const rows = [row({ adoszam: "12345678-2-41" }), row({ lead_id: "L3", company_name: "Gamma Zrt.", website: "https://gamma.hu", person: person({ name: "Szabó Éva", email: "eva@gamma.hu" }) })];
    const first = planPush(rows, crm(), opts);
    expect(first.drafts.create).toHaveLength(2);
    const cid = new Map(first.companies.create.map((c: any, i: number) => [c.ref, 100 + i]));
    const pid = new Map(first.persons.create.map((p: any, i: number) => [p.ref, 200 + i]));
    const after = crm({
      companies: first.companies.create.map((c: any) => ({ id: cid.get(c.ref), name: c.name, vat_number: c.vat_number, website: c.website })),
      persons: first.persons.create.map((p: any) => ({ id: pid.get(p.ref), first_name: p.first_name, last_name: p.last_name, email: p.email, notes: p.notes })),
      contacts: first.contacts.create.map((c: any) => ({ person_id: pid.get(c.person_ref), company_id: cid.get(c.company_ref), role: c.role })),
      drafts: first.drafts.create.map((d: any) => ({ company_id: cid.get(d.company_ref), campaign: d.campaign, status: "draft", step: 1, person_id: pid.get(d.person_ref) })),
    });
    const second = planPush(rows, after, opts);
    expect(second.companies.create).toEqual([]);
    expect(second.persons.create).toEqual([]);
    expect(second.contacts.create).toEqual([]);
    expect(second.drafts.create).toEqual([]);
    expect(second.already).toBe(2);
  });
});

describe("parity with the app helpers", () => {
  it("withFooter", () => {
    const cases: [string, string | null | undefined][] = [["Szia\n\n", "Lábléc"], ["Szia", null], ["Szia", "  "], ["Szia", undefined],
      ["Szia\n\n-- \nLábléc", "Lábléc"], ["a  \n", " Lábléc \n"]];
    for (const [b, f] of cases) expect(withFooter(b, f)).toBe(realFooter(b, f));
  });
  it("gateOn", () => {
    const tpl = (status: string, live: number | null, title = "Sablon") => ({ itemId: 1, title, status, liveVersionId: status === "live" ? live : null });
    const row = (status: string, live: number | null, title = "Sablon") => ({ title, status, live_version_id: live });
    expect(gateOn(null)).toMatchObject({ ok: realGate(null).ok });
    for (const [s, l] of [["live", 5], ["live", null], ["draft", 5], ["in_review", null]] as [string, number | null][]) {
      const a = gateOn(row(s, l)), b = realGate(tpl(s, l));
      expect(a.ok).toBe(b.ok);
      if (!b.ok) expect(a.error).toBe((b as { error: string }).error);
    }
  });
});

describe("Vanda round 3: mobiles and audit", () => {
  it("isMobile reads every Hungarian mobile form, landlines pass", () => {
    for (const m of ["+36 20 123 4567", "+36 30 123 4567", "06-70-123-4567", "0036 31 1234567", "36 30 123 4567", "36301234567", "+36 50 123 4567", "30 123 4567"]) {
      expect(isMobile(m), m).toBe(true);
    }
    for (const l of ["+36 1 234 5678", "+36 36 312 345", "36 312 345", "3612345678", "", null]) expect(isMobile(l), String(l)).toBe(false);
  });
  it("a mobile never reaches persons or contacts; a landline does", () => {
    const p = planPush([row({ person: person({ phone: "36 30 123 4567" }) }),
      row({ lead_id: "L2", company_name: "Beta Kft.", website: "https://beta.hu", person: person({ name: "Nagy Béla", email: "b@beta.hu", phone: "+36 1 234 5678" }) })], crm(), opts);
    expect(p.persons.create.map((x: any) => x.phone)).toEqual([null, "+36 1 234 5678"]);
    expect(p.contacts.create.map((x: any) => x.phone)).toEqual([null, "+36 1 234 5678"]);
  });
  it("applyPlan audits contact inserts and person note updates", async () => {
    const qs: { sql: string; args: any[] }[] = [];
    let id = 100;
    const client = {
      query: async (sql: string, args: any[] = []) => {
        qs.push({ sql, args });
        if (/^select 1 from users/.test(sql)) return { rowCount: 1, rows: [{}] };
        if (/^select notes from persons/.test(sql)) return { rowCount: 1, rows: [{ notes: "régi" }] };
        if (/returning id/.test(sql)) return { rowCount: 1, rows: [{ id: ++id }] };
        return { rowCount: 1, rows: [] };
      },
    };
    const plan = {
      companies: { create: [] }, persons: { create: [], update: [{ id: 5, notes: "régi\núj" }] },
      contacts: { create: [{ person_id: 5, person_ref: null, company_id: 7, company_ref: null, role: "ügyvezető", email: "a@x.hu", phone: null }] },
      drafts: { create: [] },
    };
    await applyPlan(client, plan, opts);
    const audits = qs.filter((q) => /insert into audit_log/.test(q.sql)).map((q) => [q.args[1], q.args[2], q.args[4], JSON.parse(q.args[3])]);
    expect(audits).toEqual([
      ["person", 5, "update", { before: { notes: "régi" }, after: { notes: "régi\núj" } }],
      ["contact", 101, "create", { before: null, after: { personId: 5, companyId: 7, role: "ügyvezető", email: "a@x.hu", phone: null } }],
    ]);
    expect(qs.at(-1)?.sql).toBe("COMMIT");
  });
});
