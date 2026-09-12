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

  it("'igény' is not 'igen' (Vanda #84 re-review)", () => {
    // "igény" ("need/demand") is everywhere in Hungarian sales prose, and the
    // prefix form made it a machine signal — tier A, "call within 1 hour".
    const co = { gate: "feladat", situation: "cég", concrete: "fal", timing: "ezen a héten" };
    expect(computeTier({ ...co, own_device: "igény szerint bérelnénk" })).toBe("B");
    expect(computeTier({ ...co, own_device: "igényelnénk egyet" })).toBe("B");
    // A real yes still is one.
    expect(computeTier({ ...co, own_device: "igen" })).toBe("A");
    expect(computeTier({ ...co, own_device: "igen, van egy gépünk" })).toBe("A");
  });

  it("'körülnézek' is one word, and it is the curious gate", () => {
    expect(computeTier({ gate: "körülnézek", situation: "cég", own_device: "igen" })).toBe("E");
  });

  it("'nem csak X' adds to X, it does not deny it", () => {
    expect(computeTier({
      gate: "feladat", situation: "cég", concrete: "nem csak fal",
      timing: "ezen a héten", own_device: "nem",
    })).toBe("B");
  });

  // The table-driven grid Vanda asked for: this is what would have caught the
  // MIN_PREFIX breakage immediately, because it pins every canonical token.
  it("every canonical landing token still tiers per the spec", () => {
    const base = { gate: "task", situation: "company", concrete: "wall", timing: "this_week" };
    const cases: [Record<string, string>, string | null][] = [
      [{ ...base, own_device: "yes" }, "A"],
      [{ ...base, own_device: "maybe" }, "A"],
      [{ ...base, own_device: "no", goal: "technology" }, "A"],
      [{ ...base, own_device: "no" }, "B"],
      [{ ...base, own_device: "no", goal: "condition" }, "B"],
      [{ ...base, situation: "pro" }, "C"],
      [{ ...base, situation: "private" }, "D"],
      [{ gate: "curious" }, "E"],
      [{ intent_path: "curious" }, "E"],
      [{ ...base, own_device: "no", timing: "no_date" }, null],
      [{ ...base, own_device: "no", concrete: "none" }, null],
      [{ gate: "task", situation: "company" }, null],
      [{}, null],
    ];
    for (const [answers, want] of cases) {
      expect(computeTier(answers), JSON.stringify(answers)).toBe(want);
    }
  });
});

describe("real Hungarian setter answers", () => {
  // Each row is its own test, named by its note, so one bad sentence fails by
  // name instead of hiding the other 40-odd rows behind it (Vanda).
  //
  // Rows that only re-pinned a situation STEM (company/pro/private keyword
  // matching) already covered by the `computeTier` suite above were dropped —
  // see the report for the removed list. Every row that survives exercises a
  // rule the rest of the suite does not.
  const cases: [string, Record<string, string>, string | null][] = [
    [
      "igen wins over a later nem in the same sentence",
      { situation: "company", own_device: "Igen, de még nem döntöttünk" },
      "A",
    ],
    [
      // NOTE was wrong: timingSet("igen") is true on its own (igen names no
      // date and isn't in the undecided list, so it falls through to the
      // permissive default). This row is null because of "meg nem" — the
      // undecided phrase, which the NO_DATE list matches directly — not
      // because "igen" fails to name a timeframe.
      "meg nem döntöttünk is the undecided phrase that kills the timing — igen alone would have set it",
      { situation: "company", concrete: "betonfal", timing: "Igen, de még nem döntöttünk" },
      null,
    ],
    [
      "a question about our tools is not a machine-ownership signal",
      { situation: "company", goal: "Milyen műszerrel csinálják?" },
      null,
    ],
    [
      "saját ingatlan is a private lead, not a company",
      { situation: "Saját ingatlan, kis projekt" },
      "D",
    ],
    [
      "the comma ends the nem before betonfal, and jövő héten is a real date",
      { situation: "company", concrete: "Nem tudom pontosan, valószínűleg betonfal", timing: "jövő héten" },
      "B",
    ],
    [
      "valamikor ősszel is an undecided timing, not a booked date",
      { situation: "company", concrete: "betonfal", timing: "Még nem dőlt el, valamikor ősszel" },
      null,
    ],
    [
      "csak érdeklődöm is the curious gate, however it's phrased",
      { gate: "Csak érdeklődöm, még nem döntöttünk semmiben" },
      "E",
    ],
    [
      "körülnézünk is still the curious branch",
      { gate: "Körülnézünk egy kicsit, nincs még konkrét elképzelésünk" },
      "E",
    ],
    [
      "tájékozódom is curious, not a task",
      { gate: "Csak tájékozódom, mennyibe kerülne egy ilyen vizsgálat" },
      "E",
    ],
    [
      "statikus is a professional, even with a hídnál nearby",
      { situation: "Statikus vagyok, sürgős munkánk van egy régi hídnál" },
      "C",
    ],
    [
      "kivitelező is a professional; projekten is not a company keyword",
      { situation: "Kivitelező vagyok, egy társasházi projekten dolgozunk" },
      "C",
    ],
    [
      "építész is a professional",
      { situation: "Építész vagyok, egy régi épület felmérésén dolgozom" },
      "C",
    ],
    [
      "műszaki ellenőr is the two-word professional phrase",
      { situation: "Műszaki ellenőrként dolgozom az önkormányzatnál" },
      "C",
    ],
    [
      "lakásfelújítás stems to lakás, a private signal",
      { situation: "Lakásfelújítás közben derült ki, hogy szükség van erre" },
      "D",
    ],
    [
      "vásárolnánk is purchase intent, a maybe-owns signal",
      { situation: "Cégünk van", own_device: "Vásárolnánk egy sajátot, ha jó áron van" },
      "A",
    ],
    [
      "gondolkodunk is a maybe-owns signal",
      { situation: "Kft vagyunk", own_device: "Gondolkodunk azon, hogy vegyünk egy saját műszert" },
      "A",
    ],
    [
      "beszerezni is a maybe-owns signal, and vállalkozásunk is the company stem",
      { situation: "Vállalkozásunk van", own_device: "Szeretnénk beszerezni egy saját gépet" },
      "A",
    ],
    [
      "a positive statement about the technology itself is tier A",
      { situation: "Cégként keresnénk meg önöket", goal: "Leginkább maga a technológia érdekel minket" },
      "A",
    ],
    [
      "igen at the front is an outright yes",
      { situation: "Kft-nk van", own_device: "Igen, van saját gépünk is" },
      "A",
    ],
    [
      "falat stems to fal, and jövő hét kedden names a date",
      { situation: "Cégünk van", concrete: "A falat kellene megvizsgálni", timing: "Jövő hét kedden" },
      "B",
    ],
    [
      "hidat stems to híd, and két hét múlva names no date but is still permissive",
      { situation: "Vállalkozás vagyunk", concrete: "Egy hidat kell megvizsgálni", timing: "Két hét múlva" },
      "B",
    ],
    [
      "padlózatot stems to padló, and szeptember végén names a date",
      { situation: "Cégünk van", concrete: "A padlózatot szeretnénk leellenőriztetni", timing: "Szeptember végén" },
      "B",
    ],
    [
      "műtárgy is a concrete structure, and holnapután names a date",
      { situation: "Kft vagyunk", concrete: "Egy műtárgy vizsgálata lenne", timing: "Holnapután" },
      "B",
    ],
    [
      "de comes after fal, so it never gets to negate it",
      { situation: "Cégünk van", concrete: "Leginkább fal, de még nem vagyunk biztosak melyik", timing: "Két héten belül" },
      "B",
    ],
    [
      "nem tudjuk pontosan mikor is not a real timeframe",
      { situation: "Cégünk van", concrete: "Fal", timing: "Még nem tudjuk pontosan mikor" },
      null,
    ],
    [
      "más, nem beton is an explicit non-concrete structure, and vállalkozás is the company stem",
      { situation: "Vállalkozás vagyunk", concrete: "Más, nem beton", timing: "Jövő héten" },
      null,
    ],
    [
      "majd tavasszal is still an undecided timing (nem biztos is the explicit shrug)",
      { situation: "Cégünk van", concrete: "Fal", timing: "Talán majd tavasszal, még nem biztos" },
      null,
    ],
    [
      "nézelődöm is the curious gate, overriding an otherwise tier-A company lead",
      { gate: "Még csak nézelődöm, nem döntöttünk semmiről", situation: "cég", own_device: "igen" },
      "E",
    ],

    // ── C: previously untested paths ──────────────────────────────────

    // C1 — CONCRETE: a yes-keyword ahead of the kill answer must still lose,
    // because table order (no, then yes) beats position in the sentence.
    [
      "falban is a yes-keyword, but nem beton (the kill answer) still wins",
      { situation: "company", concrete: "Falban lenne, de nem beton, hanem tégla", timing: "jövő héten" },
      null,
    ],
    [
      "aljzat is a yes-keyword, but the trailing nem beton still kills it",
      { situation: "company", concrete: "Aljzat, de más anyag, nem beton", timing: "jövő héten" },
      null,
    ],

    // C2 — GATE: a curious verb AND a concrete task in the same answer must
    // resolve to task, not curious — task is checked first in table order.
    [
      "gate mixes a curious verb with a concrete task; task is checked first so it doesn't fall to E",
      { gate: "Érdeklődnék, konkrét feladatunk van egy hídnál", situation: "company", concrete: "fal", timing: "jövő héten" },
      "B",
    ],

    // C3 — timing: a real date named alongside a filler/undecided word must
    // still win, however the filler is phrased.
    [
      "a numeric date (5-én) wins outright, majd egyeztetünk is just filler",
      { situation: "company", concrete: "fal", timing: "Október 5-én, majd egyeztetünk" },
      "B",
    ],
    [
      "márciusban is a DATE_SIGNAL month name, majd nekifogunk doesn't cancel it",
      { situation: "company", concrete: "fal", timing: "Márciusban majd nekifogunk" },
      "B",
    ],
    [
      "kedden is a DATE_SIGNAL day name; valamikor in front doesn't cancel it",
      { situation: "company", concrete: "fal", timing: "Valamikor jövő hét kedden" },
      "B",
    ],
    [
      "a numeric date (5-én) wins even after nem biztos opens the sentence",
      { situation: "company", concrete: "fal", timing: "Nem biztos, de október 5-én kezdünk" },
      "B",
    ],

    // C4 — OWN_DEVICE: nem/nincs opens the answer, but purchase intent after
    // the comma still makes it a machine prospect (maybe is checked before
    // no); a bare nem/nincs with nothing else is not.
    [
      "nincs opens the answer, but vásárolnánk after the comma is a maybe-owns signal",
      { situation: "company", own_device: "Nincs saját műszerünk, de vásárolnánk egyet", concrete: "fal", timing: "jövő héten" },
      "A",
    ],
    [
      "nem opens the answer, but gondolkodunk after the comma is a maybe-owns signal",
      { situation: "company", own_device: "Nem, de gondolkodunk rajta", concrete: "fal", timing: "jövő héten" },
      "A",
    ],
    [
      "a bare nem with nothing positive after it is not a machine prospect",
      { situation: "company", own_device: "Nem", concrete: "fal", timing: "jövő héten" },
      "B",
    ],
    [
      "a bare nincs with nothing positive after it is not a machine prospect",
      { situation: "company", own_device: "Nincs", concrete: "fal", timing: "jövő héten" },
      "B",
    ],
    [
      "van saját szakemberünk is staff, not equipment — own_device must not tier A",
      { situation: "company", own_device: "Van saját szakemberünk, műszer nincs", concrete: "fal", timing: "jövő héten" },
      "B",
    ],

    // C5 — the enquiry guard on goal: a question tiers nothing even when its
    // words would otherwise hit GOAL.technology; the same slot answered as a
    // statement still reaches A.
    [
      "a question about our technology is not an ownership signal — the enquiry guard blocks it",
      { situation: "company", goal: "Milyen technológiával csinálják?" },
      null,
    ],
    [
      "the same slot as a positive statement is a real technology-ownership signal",
      { situation: "company", goal: "Saját műszert szeretnénk venni" },
      "A",
    ],

    // Kill-answer-first ordering on SITUATION: company is checked before
    // private, so a private-sounding opener with a real company answer after
    // the comma still reads as a company lead (Vanda #87).
    [
      "saját ingatlan opens it, but a cégem nevén after the comma is the company answer, and table order puts company first",
      { situation: "Saját ingatlan, de a cégem nevén", concrete: "fal", timing: "jövő héten" },
      "B",
    ],
  ];

  it.each(cases)("%s", (_note, answers, want) => {
    expect(computeTier(answers)).toBe(want);
  });
});
