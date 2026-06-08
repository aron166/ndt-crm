import { describe, it, expect, vi, beforeEach } from "vitest";

// Tests for setCurrentEmployer — the LinkedIn-style, history-preserving
// workplace switch (Person ≠ Contact). Locks: (a) the old contact is CLOSED
// (endedAt set) not overwritten, (b) a new contact is opened, (c) an
// append-only interaction documents the move, (d) inline new-company creation
// works when the company isn't in the DB yet (the bug this fixes).

const { audit, db, createCompany } = vi.hoisted(() => ({
  audit: vi.fn(),
  createCompany: vi.fn(),
  db: {
    person: { findFirst: vi.fn() },
    company: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    interaction: { create: vi.fn() },
  },
}));

vi.mock("@/lib/audit", () => ({ audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/app/actions/companies", () => ({ createCompany }));

import { setCurrentEmployer } from "@/app/actions/contacts";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

beforeEach(() => {
  audit.mockReset();
  createCompany.mockReset();
  Object.values(db).forEach((model) =>
    Object.values(model).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset())
  );
  db.person.findFirst.mockResolvedValue({ id: 5, firstName: "András", lastName: "Pikó" });
  db.contact.create.mockResolvedValue({ id: 200 });
  db.interaction.create.mockResolvedValue({ id: 300 });
});

describe("setCurrentEmployer", () => {
  it("switches to an EXISTING company: closes the old contact, opens a new one, logs the move", async () => {
    db.company.findFirst.mockResolvedValue({ id: 42, name: "NDT Global Kft." });
    db.contact.findFirst.mockResolvedValue({
      id: 100, companyId: 7, startedAt: new Date("2020-01-01"),
      company: { id: 7, name: "CÖÉDÁC" },
    });

    const res = await setCurrentEmployer(fd({ personId: "5", companyId: "42", role: "Mérnök", startedAt: "2026-01-15" }));

    expect(res).toMatchObject({ success: true, companyId: 42 });
    // old contact closed (endedAt set), not deleted
    expect(db.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 100 }, data: expect.objectContaining({ endedAt: expect.any(Date) }) })
    );
    // new contact opened
    expect(db.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ personId: 5, companyId: 42, role: "Mérnök" }) })
    );
    // append-only interaction documenting the move
    expect(db.interaction.create).toHaveBeenCalledTimes(1);
    expect(db.interaction.create.mock.calls[0][0].data.notes).toContain("CÖÉDÁC → NDT Global Kft.");
    // never created a company in the existing-company path
    expect(createCompany).not.toHaveBeenCalled();
  });

  it("creates a NEW company inline when it isn't in the DB yet", async () => {
    db.contact.findFirst.mockResolvedValue(null); // person has no current employer
    createCompany.mockResolvedValue({ success: true, id: 99 });

    const res = await setCurrentEmployer(fd({ personId: "5", newCompanyName: "NDT Global Kft.", newCompanyVat: "12345678-2-01" }));

    expect(createCompany).toHaveBeenCalledWith(
      expect.objectContaining({ name: "NDT Global Kft.", vatNumber: "12345678-2-01" })
    );
    expect(res).toMatchObject({ success: true, companyId: 99 });
    expect(db.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ companyId: 99 }) })
    );
    // no old contact to close
    expect(db.contact.update).not.toHaveBeenCalled();
  });

  it("is a no-op when the target is already the current employer", async () => {
    db.company.findFirst.mockResolvedValue({ id: 42, name: "NDT Global Kft." });
    db.contact.findFirst.mockResolvedValue({
      id: 100, companyId: 42, startedAt: new Date("2020-01-01"),
      company: { id: 42, name: "NDT Global Kft." },
    });

    const res = await setCurrentEmployer(fd({ personId: "5", companyId: "42" }));

    expect(res).toMatchObject({ error: expect.any(String) });
    expect(db.contact.create).not.toHaveBeenCalled();
    expect(db.contact.update).not.toHaveBeenCalled();
  });

  it("errors when neither an existing company nor a new-company name is given", async () => {
    const res = await setCurrentEmployer(fd({ personId: "5" }));
    expect(res).toMatchObject({ error: expect.any(String) });
    expect(db.contact.create).not.toHaveBeenCalled();
  });
});
