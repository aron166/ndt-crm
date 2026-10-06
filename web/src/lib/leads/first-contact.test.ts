import { describe, it, expect } from "vitest";
import { minutesToFirstContact, tierAFlag, formatMinutes } from "./first-contact";

const t0 = new Date("2026-10-07T10:00:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60000);

describe("minutesToFirstContact", () => {
  it("null without contact, whole minutes, clamped at 0", () => {
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
