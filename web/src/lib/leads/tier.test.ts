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

  // ── Vanda's #81 findings: free text is not a substring search ──────────
  // Every case below returned the WRONG tier before the word-boundary +
  // negation matcher landed. They are the reason that fix exists.

  it("a negated keyword does not count as the signal (finding 1)", () => {
    // "not the technology — what's in the wall" was goal=technology → tier A,
    // i.e. 'call within 1 hour' for a lead who said the opposite.
    expect(computeTier({
      gate: "feladat", situation: "cég", concrete: "fal", timing: "jövő héten",
      goal: "nem a technológia érdekel, hanem mi van a falban", own_device: "nem",
    })).toBe("B");
    // ...and the same shape must still tier A when it is NOT negated.
    expect(computeTier({
      gate: "feladat", situation: "cég", goal: "a technológia érdekel", own_device: "nem",
    })).toBe("A");
  });

  it("a bare 'nem' inside a positive answer no longer kills it (finding 1)", () => {
    // "wall, but we don't know exactly where" hit CONCRETE.no on "nem" → null,
    // and the B lead vanished from the board.
    expect(computeTier({
      gate: "feladat", situation: "cég", concrete: "fal, de nem tudjuk pontosan hol",
      timing: "ezen a héten", own_device: "nem",
    })).toBe("B");
    // "hanem" is one word — it is not a negator.
    expect(computeTier({
      gate: "feladat", situation: "cég", concrete: "nem tégla, hanem beton",
      timing: "ezen a héten", own_device: "nem",
    })).toBe("B");
  });

  it("'projekt' does not make a private lead a company (finding 2)", () => {
    expect(computeTier({
      gate: "feladat", situation: "családi ház projekt", concrete: "fal", timing: "ezen a héten",
    })).toBe("D");
    expect(computeTier({
      gate: "feladat", situation: "magánszemély vagyok, de projekt jelleggel", concrete: "fal",
    })).toBe("D");
    // A real company answer still reads as one.
    expect(computeTier({
      gate: "feladat", situation: "céges projekt", concrete: "fal", timing: "ezen a héten",
      own_device: "nem",
    })).toBe("B");
  });

  it("'érdeklődöm' is the curious gate, not a fall-through to A (finding 3)", () => {
    expect(computeTier({
      gate: "most csak érdeklődöm", situation: "cég", own_device: "igen",
    })).toBe("E");
    expect(computeTier({ gate: "csak nézelődöm" })).toBe("E");
  });

  it("short keywords match whole words only", () => {
    // "más" (other) must not fire on "masszív" (massive).
    expect(computeTier({
      gate: "feladat", situation: "cég", concrete: "masszív beton fal",
      timing: "ezen a héten", own_device: "nem",
    })).toBe("B");
  });

  // ── Vanda's #84 findings: the fix's OWN regressions ───────────────────
  // An earlier revision inferred prefix-vs-exact from keyword length, which
  // disabled every 3-letter stem. These are the answers it broke.

  it("matches inflected Hungarian stems (finding 1)", () => {
    const base = { gate: "feladat", concrete: "fal", timing: "ezen a héten", own_device: "nem" };
    expect(computeTier({ ...base, situation: "a cégem nevében" })).toBe("B");
    expect(computeTier({ ...base, situation: "cégnél dolgozom" })).toBe("B");
    expect(computeTier({ ...base, situation: "cégnek kell" })).toBe("B");
    expect(computeTier({ ...base, situation: "profi vagyok" })).toBe("C");
    const co = { gate: "feladat", situation: "cég", timing: "ezen a héten", own_device: "nem" };
    expect(computeTier({ ...co, concrete: "a falban vannak vasak?" })).toBe("B");
    expect(computeTier({ ...co, concrete: "falat kell átfúrni" })).toBe("B");
    expect(computeTier({ ...co, concrete: "hidat vizsgálnánk" })).toBe("B");
  });

  it("an evaluation of the STRUCTURE is not an interest in the machine (finding 2)", () => {
    // goal=technology is a tier-A signal — "call within 1 h". A condition
    // survey must not trip it just by containing "értékel".
    const co = { gate: "feladat", situation: "cég", concrete: "fal", timing: "ezen a héten", own_device: "nem" };
    expect(computeTier({ ...co, goal: "állapot értékelés" })).toBe("B");
    expect(computeTier({ ...co, goal: "az állapotát szeretnénk értékelni" })).toBe("B");
    // ...but a real technology answer still is one.
    expect(computeTier({ ...co, goal: "a technológia érdekel" })).toBe("A");
  });

  it("'csak nézek körül' is the curious gate, not a company lead (finding 3)", () => {
    expect(computeTier({
      gate: "csak nézek körül", situation: "cég", own_device: "igen",
    })).toBe("E");
  });

  it("a comma ends the negation (finding 4)", () => {
    expect(computeTier({
      gate: "feladat", situation: "nem cég, magánszemély", concrete: "fal", timing: "ezen a héten",
    })).toBe("D");
    expect(computeTier({
      gate: "feladat", situation: "cég", concrete: "nem tudom, beton vagy tégla",
      timing: "ezen a héten", own_device: "nem",
    })).toBe("B");
  });
});
