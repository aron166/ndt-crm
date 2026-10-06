import { describe, it, expect } from "vitest";
import { firstContactFor, minutesToFirstContact, tierAFlag, formatMinutes } from "./first-contact";

const t0 = new Date("2026-10-07T10:00:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60000);

describe("minutesToFirstContact", () => {
  it("null without contact, whole minutes, guarded at 0", () => {
    expect(minutesToFirstContact(t0, null)).toBeNull();
    expect(minutesToFirstContact(t0, new Date(t0.getTime() + 90_000))).toBe(1);
    expect(minutesToFirstContact(t0, at(-5))).toBe(0);
  });
});

describe("tierAFlag", () => {
  it("only uncontacted A leads, overdue after 60 min", () => {
    expect(tierAFlag("B", t0, null, at(500))).toBeNull();
    expect(tierAFlag(null, t0, null, at(500))).toBeNull();
    expect(tierAFlag("A", t0, null, at(59))).toBe("due");
    expect(tierAFlag("A", t0, null, at(61))).toBe("overdue");
    expect(tierAFlag("A", t0, at(10), at(500))).toBeNull();
  });
});

describe("formatMinutes", () => {
  it("p / ó / n", () => {
    expect(formatMinutes(42)).toBe("42 p");
    expect(formatMinutes(185)).toBe("3 ó 5 p");
    expect(formatMinutes(2 * 1440 + 240)).toBe("2 n 4 ó");
  });
});

describe("firstContactFor", () => {
  const lead = { id: 1, companyId: 10, personId: 20, createdAt: t0 };
  const row = (o: Partial<{ leadId: number | null; companyId: number | null; personId: number | null; occurredAt: Date }>) => ({
    leadId: null, companyId: null, personId: null, occurredAt: at(5), ...o,
  });
  it("matches by lead, company-only and person-only rows", () => {
    expect(firstContactFor(lead, [row({ leadId: 1 })])).toEqual(at(5));
    expect(firstContactFor(lead, [row({ companyId: 10 })])).toEqual(at(5));
    expect(firstContactFor(lead, [row({ personId: 20 })])).toEqual(at(5));
  });
  it("ignores rows before createdAt and other companies", () => {
    expect(firstContactFor(lead, [row({ leadId: 1, occurredAt: at(-1) })])).toBeNull();
    expect(firstContactFor(lead, [row({ companyId: 11 }), row({ personId: 21 }), row({})])).toBeNull();
  });
  it("picks the earliest", () => {
    expect(firstContactFor(lead, [row({ leadId: 1, occurredAt: at(30) }), row({ companyId: 10, occurredAt: at(7) }), row({ personId: 20, occurredAt: at(9) })])).toEqual(at(7));
  });
});
