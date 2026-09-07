import { describe, it, expect } from "vitest";
import { computeTier } from "./tier";

// The spec table (machines/birdsview/27_qualification_model.md), plus the two
// ways it gets abused in the wild: a partial public payload and a setter typing
// Hungarian free text instead of the form's tokens.

const A = {
  gate: "task", situation: "company", concrete: "wall", goal: "condition",
  size: "200 m2", postcode: "9024", timing: "this_week", own_device: "maybe",
};

describe("computeTier", () => {
  it("A — company with an explicit machine signal", () => {
    expect(computeTier(A)).toBe("A");
    expect(computeTier({ ...A, own_device: "yes" })).toBe("A");
    expect(computeTier({ ...A, own_device: "no", goal: "technology" })).toBe("A");
  });

  it("B — company job: concrete + a date, no machine signal", () => {
    expect(computeTier({ ...A, own_device: "no" })).toBe("B");
    expect(computeTier({ ...A, own_device: "no", timing: "this_month" })).toBe("B");
  });

  it("C / D — professional and private", () => {
    expect(computeTier({ ...A, situation: "pro" })).toBe("C");
    expect(computeTier({ ...A, situation: "private" })).toBe("D");
  });

  it("E — the curious branch, however it is spelled", () => {
    expect(computeTier({ gate: "curious", hook: "facebook" })).toBe("E");
    expect(computeTier({ intent_path: "curious" })).toBe("E");
    // Branch B outranks a company situation: no job = nurture, not a call.
    expect(computeTier({ gate: "curious", situation: "company", own_device: "yes" })).toBe("E");
  });

  it("null — a partial payload never promotes itself to A", () => {
    // The public endpoint accepts anything; an ABSENT own_device is not a
    // machine signal (the spec's literal "own_device≠no" would make this A).
    expect(computeTier({ gate: "task", situation: "company" })).toBeNull();
    expect(computeTier({ gate: "task", situation: "company", concrete: "wall" })).toBeNull();
    expect(computeTier({})).toBeNull();
    expect(computeTier({ gate: "task" })).toBeNull();
  });

  it("null — company, but no date or not concrete", () => {
    expect(computeTier({ ...A, own_device: "no", timing: "" })).toBeNull();
    expect(computeTier({ ...A, own_device: "no", timing: "nincs még dátum" })).toBeNull();
    expect(computeTier({ ...A, own_device: "no", concrete: "más / nem beton" })).toBeNull();
  });

  it("reads a setter's Hungarian free text, not just the form's tokens", () => {
    expect(computeTier({
      gate: "konkrét feladat", situation: "Kft, ipari projekt", concrete: "födém",
      timing: "ezen a héten", own_device: "talán",
    })).toBe("A");
    expect(computeTier({
      gate: "konkrét feladat", situation: "villanyszerelő vagyok", concrete: "fal",
    })).toBe("C");
    expect(computeTier({
      gate: "feladat", situation: "saját ingatlan", concrete: "fal", timing: "ebben a hónapban",
    })).toBe("D");
    expect(computeTier({
      gate: "feladat", situation: "cég", concrete: "fal", timing: "ezen a héten", own_device: "nem",
    })).toBe("B");
  });
});
