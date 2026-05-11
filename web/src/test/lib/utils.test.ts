import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatHUF, fullName } from "@/lib/utils";

describe("formatDate", () => {
  it("returns — for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatDate(undefined)).toBe("—");
  });

  it("formats a date string in Hungarian locale", () => {
    const result = formatDate("2026-05-12");
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/05/);
    expect(result).toMatch(/12/);
  });

  it("formats a Date object", () => {
    const result = formatDate(new Date("2026-01-01"));
    expect(result).toMatch(/2026/);
  });
});

describe("formatHUF", () => {
  it("returns — for null", () => {
    expect(formatHUF(null)).toBe("—");
  });

  it("formats a number as HUF (Hungarian locale uses Ft symbol)", () => {
    const result = formatHUF(150000);
    expect(result).toContain("150");
    // hu-HU locale renders HUF as "Ft"
    expect(result).toMatch(/Ft|HUF/);
  });
});

describe("fullName", () => {
  it("joins first and last name", () => {
    expect(fullName("Béla", "Kovács")).toBe("Béla Kovács");
  });

  it("handles null last name", () => {
    expect(fullName("Béla", null)).toBe("Béla");
  });

  it("returns — when both are null", () => {
    expect(fullName(null, null)).toBe("—");
  });
});
