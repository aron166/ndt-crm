import { describe, it, expect } from "vitest";
import { authHeaders, mapLaunchRow, selectRows } from "./load-campaign-members.mjs";
import { memberRowSchema } from "@/lib/campaigns/members";

// Synthetic rows only: no real contact data in this repo.
const BASE = {
  company: "Minta Építő Kft.", crm_name: "", crm_company_id: "", vat8: "12345678", city: "Budapest", website: "minta.example",
  contact_name: "Teszt Elek", contact_role: "ügyvezető", phone: "+36 1 000 0000", email: "teszt@minta.example",
  tier: "B", lane: "contractor (eltérés)", owner: "Áron e-mail approval", why: "teszt", rank: 12, crm_lost: false,
};

describe("mapLaunchRow", () => {
  it("maps a builder row onto a valid members wire row", () => {
    const m = mapLaunchRow(BASE);
    expect(memberRowSchema.parse(m)).toMatchObject({ company_name: "Minta Építő Kft.", vat: "12345678", tier: "B", priority: 12 });
    expect(m.crm_company_id).toBeUndefined();
  });
  it("a CRM match carries the CRM id and name", () => {
    expect(mapLaunchRow({ ...BASE, crm_company_id: 42, crm_name: "Minta Építő Korlátolt" })).toMatchObject({ crm_company_id: 42, company_name: "Minta Építő Korlátolt" });
  });
  it("Péter's own network is no exception: no phone_only flag, the e-mail comes first", () => {
    expect(mapLaunchRow({ ...BASE, owner: "Péter call" })).not.toHaveProperty("phone_only");
  });
  it("apply is session only: a key alone is refused before any request", () => {
    expect(() => authHeaders(true, { CRM_KEY: "k" })).toThrow(/session only/);
    expect(authHeaders(true, { CRM_KEY: "k", CRM_COOKIE: "c=1" })).toEqual({ Cookie: "c=1" });
    expect(authHeaders(false, { CRM_KEY: "k" })).toEqual({ Authorization: "Bearer k" });
  });
  it("drops a malformed e-mail instead of failing the whole batch", () => {
    const m = mapLaunchRow({ ...BASE, email: "not an email" });
    expect(m.email).toBeUndefined();
    expect(() => memberRowSchema.parse(m)).not.toThrow();
  });
  it("skips CRM-lost rows unless asked", () => {
    const rows = [BASE, { ...BASE, crm_lost: true }];
    expect(selectRows(rows)).toHaveLength(1);
    expect(selectRows(rows, { includeLost: true })).toHaveLength(2);
  });
});
