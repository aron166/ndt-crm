import { describe, it, expect } from "vitest";
import { dueInfo } from "./NextStepStrip";
import { atBudapest } from "@/lib/leads/lifecycle";

describe("next-step strip due label (Budapest calendar days, Vanda C2)", () => {
  const now = atBudapest(2026, 11, 9, 23, 50);
  it("00:30 next Budapest day is tomorrow, not today, whatever the runtime timezone", () => {
    expect(dueInfo(atBudapest(2026, 11, 10, 0, 30), now)).toEqual({ rel: "holnap", color: "var(--fg-soft)" });
  });
  it("same Budapest day is today", () => {
    expect(dueInfo(atBudapest(2026, 11, 9, 23, 59), now)?.rel).toBe("ma");
  });
  it("counts calendar days, not 24 h blocks", () => {
    expect(dueInfo(atBudapest(2026, 11, 11, 0, 10), now)?.rel).toBe("2 nap múlva");
  });
  it("overdue is coral, by calendar day once past midnight", () => {
    expect(dueInfo(atBudapest(2026, 11, 9, 20, 0), now)).toEqual({ rel: "3 órája lejárt", color: "var(--coral)" });
    expect(dueInfo(atBudapest(2026, 11, 7, 12, 0), now)?.rel).toBe("2 napja lejárt");
  });
});
