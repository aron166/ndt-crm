import { describe, it, expect } from "vitest";
import { computeTier } from "./qualification";

const A = { gate: "task", situation: "company", concrete: "wall", goal: "condition", size: "200 m2", postcode: "9024", timing: "this_week", own_device: "maybe" };

describe("computeTier", () => {
  it("A — company with a machine signal", () => {
    expect(computeTier(A)).toBe("A");
    expect(computeTier({ ...A, own_device: "no", goal: "technology" })).toBe("A");
  });
  it("B — company job, concrete, timing set, no machine signal", () => {
    expect(computeTier({ ...A, own_device: "no" })).toBe("B");
  });
  it("E — company, no concrete or no date", () => {
    expect(computeTier({ ...A, own_device: "no", concrete: "other" })).toBe("E");
    expect(computeTier({ ...A, own_device: "no", timing: "" })).toBe("E");
  });
  it("C/D — pro and private", () => {
    expect(computeTier({ ...A, situation: "pro" })).toBe("C");
    expect(computeTier({ ...A, situation: "private" })).toBe("D");
  });
  it("E — curious branch and junk", () => {
    expect(computeTier({ gate: "curious", hook: "fb" })).toBe("E");
    expect(computeTier({})).toBe("E");
  });
});
