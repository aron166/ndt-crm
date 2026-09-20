import { describe, it, expect } from "vitest";
import { employerState, employerLabel, type EmployerContact } from "./employer";

function contact(over: Partial<EmployerContact>): EmployerContact {
  return {
    companyId: 1, role: null, startedAt: null, endedAt: null,
    company: { name: "ACME" },
    ...over,
  };
}

describe("employerState", () => {
  it("picks the open contact over ended ones", () => {
    const state = employerState([
      contact({ companyId: 1, company: { name: "ACÉLHIDAK" }, startedAt: "2020-01-01", endedAt: "2026-01-01" }),
      contact({ companyId: 2, company: { name: "NDT GLOBAL" }, startedAt: "2026-01-02", endedAt: null }),
    ]);
    expect(state).toEqual({ kind: "current", companyId: 2, companyName: "NDT GLOBAL", role: null });
  });

  it("picks the LATEST open contact when there are two", () => {
    const state = employerState([
      contact({ companyId: 1, company: { name: "OLD OPEN" }, startedAt: "2020-01-01", endedAt: null }),
      contact({ companyId: 2, company: { name: "NEW OPEN" }, startedAt: "2024-01-01", endedAt: null }),
    ]);
    expect(state).toEqual({ kind: "current", companyId: 2, companyName: "NEW OPEN", role: null });
  });

  it("falls back to the most recently ended contact when none is open", () => {
    const state = employerState([
      contact({ companyId: 1, company: { name: "ACÉLHIDAK" }, startedAt: "2018-01-01", endedAt: "2020-01-01" }),
      contact({ companyId: 2, company: { name: "LAST JOB" }, startedAt: "2020-02-01", endedAt: "2025-06-01" }),
    ]);
    expect(state).toMatchObject({ kind: "former", companyId: 2, companyName: "LAST JOB" });
  });

  it("is unknown for an empty contact list", () => {
    expect(employerState([])).toEqual({ kind: "unknown" });
  });

  it("handles Date objects and string dates the same way", () => {
    const withStrings = employerState([
      contact({ companyId: 1, company: { name: "A" }, startedAt: "2020-01-01", endedAt: "2020-06-01" }),
      contact({ companyId: 2, company: { name: "B" }, startedAt: "2021-01-01", endedAt: "2021-06-01" }),
    ]);
    const withDates = employerState([
      contact({ companyId: 1, company: { name: "A" }, startedAt: new Date("2020-01-01"), endedAt: new Date("2020-06-01") }),
      contact({ companyId: 2, company: { name: "B" }, startedAt: new Date("2021-01-01"), endedAt: new Date("2021-06-01") }),
    ]);
    expect(withStrings).toEqual(withDates);
  });

  it("a null startedAt sorts oldest, never beating a real date", () => {
    const state = employerState([
      contact({ companyId: 1, company: { name: "NO START DATE" }, startedAt: null, endedAt: null }),
      contact({ companyId: 2, company: { name: "DATED" }, startedAt: "2020-01-01", endedAt: null }),
    ]);
    expect(state.kind).toBe("current");
    expect((state as { companyId: number }).companyId).toBe(2);
  });
});

describe("employerLabel", () => {
  it("returns the company name for current", () => {
    expect(employerLabel({ kind: "current", companyId: 1, companyName: "NDT GLOBAL", role: null })).toBe("NDT GLOBAL");
  });

  it("returns 'Volt: <name>' for former", () => {
    expect(employerLabel({ kind: "former", companyId: 1, companyName: "ACÉLHIDAK", role: null, endedAt: new Date() }))
      .toBe("Volt: ACÉLHIDAK");
  });

  it("returns the unknown label", () => {
    expect(employerLabel({ kind: "unknown" })).toBe("Munkahely ismeretlen");
  });
});
