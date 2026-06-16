import { describe, it, expect } from "vitest";
import { nextStatusFor, outcomeMeta, isCallOutcome, CALL_OUTCOMES } from "./queue";

describe("nextStatusFor", () => {
  it("sets explicit judgment outcomes regardless of current status", () => {
    expect(nextStatusFor("interested", "1")).toBe("3");
    expect(nextStatusFor("wants", "2")).toBe("5");
    expect(nextStatusFor("not_interested", "5")).toBe("4");
    expect(nextStatusFor("bad_number", "3")).toBe("0");
  });

  it("no_answer only advances Nem hívtuk(1) → NV(2)", () => {
    expect(nextStatusFor("no_answer", "1")).toBe("2");
  });

  it("no_answer never downgrades an already-qualified company", () => {
    // Calling an Érdeklődő(3)/Kéri(5) and getting no answer must not reset them.
    expect(nextStatusFor("no_answer", "3")).toBeNull();
    expect(nextStatusFor("no_answer", "5")).toBeNull();
    expect(nextStatusFor("no_answer", "2")).toBeNull();
    expect(nextStatusFor("no_answer", null)).toBeNull();
  });

  it("note_only and unknown outcomes never change status", () => {
    expect(nextStatusFor("note_only", "1")).toBeNull();
    expect(nextStatusFor("whatever", "1")).toBeNull();
  });
});

describe("outcome taxonomy", () => {
  it("every outcome resolves and is recognised", () => {
    for (const o of CALL_OUTCOMES) {
      expect(isCallOutcome(o.key)).toBe(true);
      expect(outcomeMeta(o.key)?.interactionOutcome).toBeTruthy();
    }
  });
  it("rejects unknown keys", () => {
    expect(isCallOutcome("nope")).toBe(false);
    expect(outcomeMeta("nope")).toBeUndefined();
  });
});
