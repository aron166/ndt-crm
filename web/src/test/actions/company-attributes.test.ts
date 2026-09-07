import { describe, it, expect, vi, beforeEach } from "vitest";

// Airtight data-persistence tests for the historical company attributes.
// Locks: setPrimary END-DATES the old primary (never overwrites) + inserts a new
// current row + updates the denormalized column, all in one transaction;
// addSecondary inserts a non-primary current row; a primary can't be end-dated.

const { audit, db } = vi.hoisted(() => {
  const db: Record<string, Record<string, ReturnType<typeof vi.fn>>> & {
    $transaction?: (fn: (tx: unknown) => unknown) => unknown;
  } = {
    company: { findFirst: vi.fn(), update: vi.fn() },
    companyAttribute: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  };
  db.$transaction = (fn: (tx: unknown) => unknown) => fn(db);
  return { audit: vi.fn(), db };
});

vi.mock("@/lib/audit", () => ({ audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));

import {
  setPrimaryCompanyAttribute, addSecondaryCompanyAttribute, endCompanyAttribute,
} from "@/app/actions/company-attributes";

beforeEach(() => {
  audit.mockReset();
  Object.values(db).forEach((model) =>
    Object.values(model).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset?.())
  );
  db.company.findFirst.mockResolvedValue({ id: 1 });
  db.companyAttribute.create.mockResolvedValue({ id: 99 });
});

describe("setPrimaryCompanyAttribute", () => {
  it("end-dates the old primary, inserts a new current row, updates the column", async () => {
    db.companyAttribute.findFirst.mockResolvedValue({ id: 10, value: "2511", label: "old", isPrimary: true });

    const res = await setPrimaryCompanyAttribute(1, "teaor", "7112", "Üzletvezetés");

    expect(res).toMatchObject({ success: true });
    // old primary moved to history, not overwritten
    expect(db.companyAttribute.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 10 }, data: expect.objectContaining({ validTo: expect.any(Date), isPrimary: false }) })
    );
    // new current primary row inserted
    expect(db.companyAttribute.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attrType: "teaor", value: "7112", isPrimary: true }) })
    );
    // denormalized column updated (teaorCode + teaorDescription)
    expect(db.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ teaorCode: "7112", teaorDescription: "Üzletvezetés" }) })
    );
  });

  it("is a no-op (no history row) when the primary value is unchanged", async () => {
    db.companyAttribute.findFirst.mockResolvedValue({ id: 10, value: "2511", label: "Fémszerkezet", isPrimary: true });

    const res = await setPrimaryCompanyAttribute(1, "teaor", "2511", "Fémszerkezet");

    expect(res).toMatchObject({ success: true });
    expect(db.companyAttribute.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown attribute type", async () => {
    const res = await setPrimaryCompanyAttribute(1, "bogus", "x");
    expect(res).toMatchObject({ error: expect.any(String) });
  });
});

describe("addSecondaryCompanyAttribute", () => {
  it("adds a non-primary current row for a multi type (teaor)", async () => {
    db.companyAttribute.findFirst.mockResolvedValue(null); // no dup
    const res = await addSecondaryCompanyAttribute(1, "teaor", "4321", "Egyéb");
    expect(res).toMatchObject({ success: true });
    expect(db.companyAttribute.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ value: "4321", isPrimary: false }) })
    );
  });

  it("refuses a secondary on a single-value type (warmth)", async () => {
    const res = await addSecondaryCompanyAttribute(1, "warmth", "warm");
    expect(res).toMatchObject({ error: expect.any(String) });
    expect(db.companyAttribute.create).not.toHaveBeenCalled();
  });
});

describe("endCompanyAttribute", () => {
  it("end-dates a non-primary current value", async () => {
    db.companyAttribute.findFirst.mockResolvedValue({ id: 7, companyId: 1, attrType: "teaor", value: "4321", isPrimary: false });
    const res = await endCompanyAttribute(7);
    expect(res).toMatchObject({ success: true });
    expect(db.companyAttribute.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: { validTo: expect.any(Date) } })
    );
  });

  it("refuses to end a primary value (must be replaced via setPrimary)", async () => {
    db.companyAttribute.findFirst.mockResolvedValue({ id: 8, companyId: 1, attrType: "teaor", value: "2511", isPrimary: true });
    const res = await endCompanyAttribute(8);
    expect(res).toMatchObject({ error: expect.any(String) });
    expect(db.companyAttribute.update).not.toHaveBeenCalled();
  });
});
