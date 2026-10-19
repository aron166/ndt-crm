import { describe, expect, it } from "vitest";
import { gateOn as realGate } from "@/lib/outreach/template";
import { withFooter as realFooter } from "@/lib/outreach/drafts";
import { gateOn, planPush, splitPerson, withFooter } from "./corvid-push.mjs";

const opts = { tenant: 1, sender: 3, campaign: "corvid-betonscan-w1" };
const CAMP = opts.campaign;

const person = (o: Record<string, unknown> = {}) => ({
  name: "Kovács János", title: "ügyvezető", role_class: "decision_maker", phone: "+36 1 234", linkedin: null,
  source: "registry", source_url: "https://src.example/a", retrieved_at: "2026-10-19T08:43:31+00:00", confidence: 0.8,
  email: "janos@example.hu", ...o,
});
const row = (o: Record<string, unknown> = {}) => ({
  lead_id: "L1", score: 70, kind: "contractor", company_name: "Alpha Kft.", adoszam: null, website: "https://alpha.hu",
  city: "Győr", person: person(), subject: "Tárgy", body: "Szia\n", ...o,
});
const crm = (o: Record<string, unknown> = {}) => ({
  companies: [] as any[], persons: [] as any[], contacts: [] as any[], drafts: [] as any[],
  suppression: { emails: new Set<string>(), domains: new Set<string>() }, gate: { ok: true }, footer: "Lábléc" as string | null, ...o,
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

describe("rerun", () => {
  it("creates nothing once the first plan is in the CRM", () => {
    const rows = [row({ adoszam: "12345678-2-41" }), row({ lead_id: "L3", company_name: "Gamma Zrt.", person: person({ name: "Szabó Éva", email: "eva@gamma.hu" }) })];
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
