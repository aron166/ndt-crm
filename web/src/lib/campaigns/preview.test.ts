// The quick view and the launch-tab check are READ ONLY and tenant scoped: every db call is a read,
// and every where names the tenant. A member with missing data gets its gaps named, not blanks.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";

vi.mock("@/lib/integrations/resend", () => ({ getResendConfig: vi.fn().mockResolvedValue(null) }));
const READS = ["findFirst", "findMany", "findUnique", "aggregate", "count", "groupBy"] as const;
const WRITES = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"] as const;
vi.mock("@/lib/db", () => {
  const model = () => Object.fromEntries([
    ...["findFirst", "findMany", "findUnique", "aggregate", "count", "groupBy"].map((k) => [k, vi.fn()]),
    ...["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"].map((k) => [k, vi.fn(() => { throw new Error(`write: ${k}`); })]),
  ]);
  const names = ["campaign", "campaignStep", "campaignMember", "campaignEvent", "contentItem", "contentReview", "user", "tenant", "contact", "lead", "deal", "interaction", "emailDraft"];
  return { db: { ...Object.fromEntries(names.map((n) => [n, model()])), $executeRaw: vi.fn(() => { throw new Error("raw write"); }), $transaction: vi.fn(() => { throw new Error("tx"); }) } };
});

import { campaignEmailCheck, memberQuickView, isRoleAddress, memberAddress } from "./preview";

type M = ReturnType<typeof vi.fn>;
const d = db as unknown as Record<string, Record<string, M>>;
const T = 7;
const MEMBER = {
  id: 1, companyId: 40, personId: null, state: "needs_email", stepPosition: 1, tier: "B", lane: "warm network (Péter phones)", why: null, city: null,
  segment: null, source: null, contactSource: null, importBatch: "bp-1", createdPerson: false, createdCompany: false, leadId: null,
  attempts: 0, lastOutcome: null, lastTouchedAt: null, nextEligibleOn: null,
  company: { id: 40, name: "Minta <b>Kft.</b>", city: "Győr", website: null, accountType: null, customerValue: null, inspectionFrequency: null, ndtMethods: [], lastInteractionDate: null },
  person: null,
};
const LIVE = { id: 60, title: "Vágás előtt", status: "live", currentVersion: { id: 601, number: 1, body: "x" }, liveVersion: { id: 601, number: 1, body: "{{greeting}} {{sender_phone}}" } };

beforeEach(() => {
  for (const m of Object.values(d)) for (const k of READS) (m as Record<string, M>)[k]?.mockReset?.();
  d.campaign.findFirst.mockResolvedValue({ id: 3, slug: "bp", senderUserId: null, steps: [{ position: 1, channel: "email" }, { position: 2, channel: "call" }] });
  d.campaignMember.findFirst.mockResolvedValue(MEMBER);
  d.campaignMember.findMany.mockResolvedValue([MEMBER, { ...MEMBER, id: 2, companyId: 41, segment: "drillers", person: { firstName: "Anna", lastName: "Kovács", email: "anna@p.example.test", phone: null } }]);
  d.campaignStep.findMany.mockResolvedValue([{ position: 1, contentItemId: null }]);
  d.contentItem.findMany
    .mockResolvedValueOnce([{ id: 60, status: "live", sourceMeta: { campaignStep: 1, segment: "D" } }])
    .mockResolvedValueOnce([LIVE]);
  d.contentReview.findMany.mockResolvedValue([]);
  d.tenant.findUnique.mockResolvedValue({ settings: {} });
  d.user.findFirst.mockResolvedValue(null);
  for (const n of ["contact", "lead", "deal", "campaignEvent"]) d[n].findMany.mockResolvedValue([]);
  d.campaignMember.findMany.mockResolvedValueOnce([]).mockResolvedValue([MEMBER, { ...MEMBER, id: 2, companyId: 41, segment: "drillers", person: { firstName: "Anna", lastName: "Kovács", email: "anna@p.example.test", phone: null } }]);
  d.interaction.aggregate.mockResolvedValue({ _count: { _all: 0 }, _max: { occurredAt: null } });
});

function assertReadOnlyAndScoped() {
  for (const [name, m] of Object.entries(d)) {
    for (const k of WRITES) expect((m as Record<string, M>)[k] ?? vi.fn(), `${name}.${k}`).not.toHaveBeenCalled();
    for (const k of READS) {
      for (const call of ((m as Record<string, M>)[k]?.mock.calls ?? [])) {
        const where = (call[0] as { where?: Record<string, unknown> })?.where ?? {};
        // tenant.findUnique is keyed by the tenant id itself.
        expect(name === "tenant" ? where.id : where.tenantId, `${name}.${k} scoped`).toBe(T);
      }
    }
  }
}

describe("memberQuickView", () => {
  it("opening it writes nothing and scopes every query by tenant", async () => {
    const v = await memberQuickView(T, "bp", 1);
    expect(v).not.toBeNull();
    assertReadOnlyAndScoped();
  });
  it("names what is missing instead of blanks: no address, unknown segment means no asset", async () => {
    const v = (await memberQuickView(T, "bp", 1))!;
    expect(v.member.segment).toBeNull();
    expect(v.contact.email).toBeNull();
    expect(v.contact.origin).toBeNull();
    expect(v.problems).toEqual(["nincs e-mail cím", "1. lépés: nincs anyag (a szegmens ismeretlen)"]);
    expect(v.emails[0]).toMatchObject({ itemId: null, rendered: null });
  });
  it("Vanda #195-5: a phone only on the contact's person is shown", async () => {
    d.contact.findMany.mockResolvedValue([{ companyId: 40, personId: 3, role: null, email: null, phone: null, person: { firstName: "A", lastName: "B", email: null, phone: "+36 1 000 0001" } }]);
    expect((await memberQuickView(T, "bp", 1))!.contact.phone).toBe("+36 1 000 0001");
  });
  it("a member of another campaign or tenant is not found", async () => {
    d.campaignMember.findFirst.mockResolvedValue(null);
    expect(await memberQuickView(T, "bp", 999)).toBeNull();
    expect(d.campaignMember.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: T, campaignId: 3, id: 999 });
  });
});

describe("campaignEmailCheck", () => {
  it("counts complete, unresolved, no address and no asset, read only", async () => {
    d.contentItem.findMany.mockReset()
      .mockResolvedValueOnce([{ id: 60, status: "live", sourceMeta: { campaignStep: 1, segment: "D" } }])
      .mockResolvedValueOnce([LIVE]);
    d.campaignMember.findMany.mockReset().mockResolvedValue([MEMBER, { ...MEMBER, id: 2, companyId: 41, segment: "drillers", person: { firstName: "Anna", lastName: "Kovács", email: "anna@p.example.test", phone: null } }]);
    const c = await campaignEmailCheck(T, 3, null);
    expect(c).toMatchObject({ total: 2, complete: 0, unresolved: 1, noAddress: 1, noAsset: 1, notLive: 0 });
    expect(c.rows.find((r) => r.memberId === 2)?.problems).toEqual(["1. lépés: kitöltetlen mező: feladó telefonszáma"]);
    assertReadOnlyAndScoped();
  });
});

describe("contact helpers", () => {
  it("role address vs personal", () => {
    expect(isRoleAddress("info@x.example")).toBe(true);
    expect(isRoleAddress("kovacs.anna@x.example")).toBe(false);
  });
  it("address order: the member's person, then its contacts, then any contact", () => {
    const contacts = [{ companyId: 1, personId: 9, email: "x@a.example", person: { email: null } }, { companyId: 1, personId: 5, email: null, person: { email: "p@a.example" } }];
    expect(memberAddress({ companyId: 1, personId: 5, person: { email: null } }, contacts)).toBe("p@a.example");
    expect(memberAddress({ companyId: 1, personId: null, person: null }, contacts)).toBe("x@a.example");
    expect(memberAddress({ companyId: 2, personId: null, person: null }, contacts)).toBeNull();
  });
});
