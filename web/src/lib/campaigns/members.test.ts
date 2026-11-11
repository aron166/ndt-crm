import { describe, it, expect } from "vitest";
import { planMembers, memberRowSchema, type MemberIndex } from "./members";
import type { StepDef } from "./rules";

const STEPS: StepDef[] = [
  { position: 1, channel: "email", waitDays: 0 },
  { position: 2, channel: "call", waitDays: 3 },
];

function idx(over: Partial<MemberIndex> = {}): MemberIndex {
  return {
    aliveCompanyIds: new Set([10, 11, 12, 13]),
    byVat: new Map([["12345678", 11]]),
    byName: new Map([["peldaepito", 12]]),
    openLeadCompanyIds: new Set([13]),
    members: new Map(),
    suppressions: { emails: new Set(["no@x.example.test"]), domains: new Set(["blocked.example.test"]) },
    personByEmail: new Map([["anna@pelda.example.test", 501]]),
    companyReach: new Map([[12, { phone: true, email: false, personId: 77 }]]),
    ...over,
  };
}
const row = (r: Record<string, unknown>) => memberRowSchema.parse(r);

describe("planMembers: dedupe against existing companies, leads and suppressions", () => {
  it("matches by crm_company_id, then VAT, then name key; else creates", () => {
    const p = planMembers([
      row({ crm_company_id: 10, company_name: "Bármi", phone: "+361" }),
      row({ company_name: "Más név", vat: "12345678-2-41", email: "a@b.example.test" }),
      row({ company_name: "Példa Építő Kft.", phone: "+362" }),
      row({ company_name: "Új Cég Kft.", email: "uj@uj.example.test" }),
    ], idx(), STEPS);
    expect(p.rows.map((r) => r.companyId)).toEqual([10, 11, 12, null]);
    expect(p.summary).toMatchObject({ add: 4, matchedCompanies: 3, newCompanies: 1 });
  });
  it("skips a company with an open lead, a suppressed address or domain, and an unknown id", () => {
    const p = planMembers([
      row({ crm_company_id: 13, company_name: "Nyitott", phone: "1" }),
      row({ company_name: "A", email: "no@x.example.test" }),
      row({ company_name: "B", email: "anyone@blocked.example.test" }),
      row({ crm_company_id: 999, company_name: "C" }),
    ], idx(), STEPS);
    expect(p.summary.skipped).toMatchObject({ open_lead: 1, suppressed: 2, unknown_company_id: 1 });
    expect(p.summary.add).toBe(0);
  });
  it("the same company twice in one payload is added once", () => {
    const p = planMembers([
      row({ company_name: "Példa Építő Kft.", phone: "1" }),
      row({ company_name: "PÉLDA ÉPÍTŐ Kft", phone: "2" }),
    ], idx(), STEPS);
    expect(p.summary).toMatchObject({ add: 1 });
    expect(p.summary.skipped.duplicate_in_payload).toBe(1);
  });
  it("reuses a person by e-mail; existing contacts count as reach", () => {
    const p = planMembers([
      row({ company_name: "Új", email: "Anna@Pelda.example.test", person_name: "Anna Kiss" }),
      row({ crm_company_id: 12, company_name: "Példa" }),
    ], idx(), STEPS);
    const [a, b] = p.rows;
    expect(a).toMatchObject({ action: "add", person: 501, stepPosition: 1, state: "queued" });
    // company 12 has a contact with a phone and no e-mail: straight to the call step
    expect(b).toMatchObject({ action: "add", person: 77, stepPosition: 2, state: "queued" });
  });
  it("phone_only rows (Péter's own clients) start on the call step", () => {
    const p = planMembers([row({ company_name: "Régi ügyfél", phone: "1", email: "r@r.example.test", phone_only: true })], idx(), STEPS);
    expect(p.rows[0]).toMatchObject({ stepPosition: 2 });
  });
  it("no contact at all loads as needs_contact", () => {
    const p = planMembers([row({ company_name: "Senki Kft." })], idx(), STEPS);
    expect(p.rows[0]).toMatchObject({ action: "add", state: "needs_contact", person: null });
    expect(p.summary.needsContact).toBe(1);
  });
  it("a re-run refreshes a needs_contact member that now has a contact, and skips the rest", () => {
    const members = new Map([[10, "needs_contact"], [11, "queued"]]);
    const p = planMembers([
      row({ crm_company_id: 10, company_name: "X", phone: "1" }),
      row({ crm_company_id: 11, company_name: "Y", phone: "1" }),
    ], idx({ members }), STEPS);
    expect(p.rows.map((r) => r.action)).toEqual(["refresh", "skip"]);
  });
  it("the wire schema rejects a bad e-mail and treats empty strings as absent", () => {
    expect(() => row({ company_name: "A", email: "nope" })).toThrow();
    expect(row({ company_name: "A", email: "", phone: "  " })).toMatchObject({ email: undefined, phone: undefined });
  });
});
