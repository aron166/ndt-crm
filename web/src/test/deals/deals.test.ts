import { describe, it, expect } from "vitest";

// Weighted forecast calculation — pure function extracted for testing
function weightedForecast(
  deals: { value: number | null; probability: number; isTerminal: boolean }[]
): number {
  return deals.reduce((sum, d) => {
    if (!d.value || d.isTerminal) return sum;
    return sum + (d.value * d.probability) / 100;
  }, 0);
}

// Stale deal = active (non-terminal) deal with no open tasks
function isStale(isTerminal: boolean, openTaskCount: number): boolean {
  return !isTerminal && openTaskCount === 0;
}

describe("weightedForecast", () => {
  it("sums value × probability for non-terminal deals", () => {
    const result = weightedForecast([
      { value: 1_000_000, probability: 40, isTerminal: false },
      { value: 500_000,   probability: 70, isTerminal: false },
    ]);
    expect(result).toBe(400_000 + 350_000);
  });

  it("excludes terminal deals (won/lost)", () => {
    const result = weightedForecast([
      { value: 2_000_000, probability: 100, isTerminal: true },
      { value: 500_000,   probability: 50,  isTerminal: false },
    ]);
    expect(result).toBe(250_000);
  });

  it("excludes null-value deals", () => {
    const result = weightedForecast([
      { value: null, probability: 60, isTerminal: false },
      { value: 1_000_000, probability: 60, isTerminal: false },
    ]);
    expect(result).toBe(600_000);
  });

  it("returns 0 for empty pipeline", () => {
    expect(weightedForecast([])).toBe(0);
  });
});

describe("isStale", () => {
  it("non-terminal deal with no tasks is stale", () => {
    expect(isStale(false, 0)).toBe(true);
  });

  it("non-terminal deal with open tasks is not stale", () => {
    expect(isStale(false, 1)).toBe(false);
  });

  it("terminal (won/lost) deal is never stale", () => {
    expect(isStale(true, 0)).toBe(false);
    expect(isStale(true, 1)).toBe(false);
  });
});
