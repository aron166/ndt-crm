import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { db } = vi.hoisted(() => {
  const db: Record<string, Record<string, ReturnType<typeof vi.fn>>> & {
    $transaction?: (fn: (tx: unknown) => unknown) => unknown;
  } = {
    company: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    companyAttribute: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  };
  db.$transaction = (fn: (tx: unknown) => unknown) => fn(db);
  return { db };
});

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/integrations/google_maps", () => ({ geocode: vi.fn() }));
vi.mock("@/lib/actor", () => {
  const getActor = async (_t?: number) => ({ userId: 1, email: "a@b.c" });
  return { getActor, NOT_A_CRM_USER: "NOT_A_CRM_USER", requireCrmUser: async (t: number) => ((await getActor(t)).userId == null ? "NOT_A_CRM_USER" : null),
};
});

import { COMPANY_ATTR_DEFS } from "@/lib/companies/attributes";
import { normalizeAccountType, normalizeStatus, normalizeWarmth } from "@/lib/import/normalize";
import { createCompany, updateCompany } from "@/app/actions/companies";
import { setPrimaryCompanyAttribute } from "@/app/actions/company-attributes";

beforeEach(() => {
  Object.values(db).forEach((m) => Object.values(m).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset?.()));
  db.company.findFirst.mockResolvedValue({ id: 1, name: "X", status: "active", accountType: null });
  db.company.create.mockResolvedValue({ id: 5 });
  db.company.update.mockResolvedValue({ name: "X", status: "active", city: null });
  db.companyAttribute.create.mockResolvedValue({ id: 9 });
});

describe("enum options round-trip through the normalisers", () => {
  const cases = [
    ["account_type", normalizeAccountType],
    ["status", normalizeStatus],
    ["warmth", normalizeWarmth],
  ] as const;
  for (const [type, norm] of cases) {
    for (const o of COMPANY_ATTR_DEFS[type].options!) {
      it(`${type}: ${o.value} / ${o.label}`, () => {
        expect(norm(o.value)).toBe(o.value);
        expect(norm(o.label)).toBe(o.value);
      });
    }
  }
  it("F.A. maps to fa", () => expect(normalizeStatus("F.A.")).toBe("fa"));
});

describe("company write paths store canonical values", () => {
  it("createCompany", async () => {
    await createCompany({ name: "Acme", accountType: "Ügyfél", status: "F.A." });
    expect(db.company.create.mock.calls[0][0].data).toMatchObject({ accountType: "Customer", status: "fa" });
  });
  it("updateCompany canonicalises", async () => {
    await updateCompany(1, { accountType: "Szállító" });
    expect(db.company.update.mock.calls[0][0].data.accountType).toBe("Vendor");
  });
  it("updateCompany rejects unknown values without writing", async () => {
    const r = await updateCompany(1, { accountType: "nonsense" });
    expect(r).toHaveProperty("error");
    expect(db.company.update).not.toHaveBeenCalled();
  });
  it("setPrimaryCompanyAttribute writes canonical to row and column", async () => {
    db.companyAttribute.findFirst.mockResolvedValue(null);
    const r = await setPrimaryCompanyAttribute(1, "account_type", "Ügyfél");
    expect(r).toMatchObject({ success: true });
    expect(db.companyAttribute.create.mock.calls[0][0].data.value).toBe("Customer");
    expect(JSON.stringify(db.company.update.mock.calls[0][0].data)).toContain("Customer");
    expect(JSON.stringify(db.company.update.mock.calls[0][0].data)).not.toContain("Ügyfél");
  });
});

describe("UI never submits Hungarian enum values", () => {
  const files = [
    "src/app/(app)/companies/[id]/CompanyDetailClient.tsx",
    "src/components/CreateCompanyModal.tsx",
    "src/components/EditCompanyModal.tsx",
  ];
  for (const f of files) {
    it(f, () => {
      const src = readFileSync(f, "utf8");
      for (const bad of ['value="Ügyfél"', 'value="Szállító"', 'value="F.A."', 'value="Aktív"']) {
        expect(src).not.toContain(bad);
      }
    });
  }
});
