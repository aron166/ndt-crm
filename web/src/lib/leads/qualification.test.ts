import { describe, it, expect } from "vitest";
import {
  DEFAULT_QUALIFICATION_QUESTIONS, questionsFromSettings, setsFromSettings, parseQuestionList,
  parseAnswers, answersFrom, answerSourcesFrom, withAnswers, effectiveAnswers, legacyAnswers,
  SET_DISCOVERY, QUESTION_MAX, ANSWER_MAX,
} from "./qualification";
import { computeTier } from "./tier";

const Q = [{ slug: "a", label: "A?" }, { slug: "b", label: "B?" }];

describe("questionsFromSettings — a bad settings row must never take the page down", () => {
  it("falls back to the placeholders", () => {
    for (const bad of [null, undefined, {}, { qualificationQuestions: "x" }, { qualificationQuestions: [] },
                       { qualificationQuestions: [{ slug: "a" }] }, { qualificationQuestions: [{ label: "" , slug: "a" }] }]) {
      expect(questionsFromSettings(bad)).toEqual(DEFAULT_QUALIFICATION_QUESTIONS);
    }
  });
  it("never throws on garbage", () => {
    for (const bad of [42, "x", [], () => {}]) {
      expect(() => questionsFromSettings(bad)).not.toThrow();
      expect(questionsFromSettings(bad)).toEqual(DEFAULT_QUALIFICATION_QUESTIONS);
    }
  });
  it("old-shape rows (no sets) put every question in the discovery set, slugs/labels intact", () => {
    expect(questionsFromSettings({ qualificationQuestions: Q })).toEqual([
      { slug: "a", label: "A?", sets: [SET_DISCOVERY] },
      { slug: "b", label: "B?", sets: [SET_DISCOVERY] },
    ]);
  });
  it("takes a valid list and drops duplicate slugs (they'd share one answer)", () => {
    const withSets = Q.map((q) => ({ ...q, sets: [SET_DISCOVERY] }));
    expect(questionsFromSettings({ qualificationQuestions: withSets })).toEqual(withSets);
    expect(questionsFromSettings({ qualificationQuestions: [...withSets, { slug: "a", label: "again" }] })).toEqual(withSets);
  });
  it("refuses an unbounded list", () => {
    const many = Array.from({ length: QUESTION_MAX + 1 }, (_, i) => ({ slug: `q${i}`, label: `Q${i}` }));
    expect(questionsFromSettings({ qualificationQuestions: many })).toEqual(DEFAULT_QUALIFICATION_QUESTIONS);
  });
});

describe("setsFromSettings", () => {
  it("a question referencing an unknown set still gets a set entry back", () => {
    const questions = [{ slug: "a", label: "A?", sets: ["ghost"] }];
    const sets = setsFromSettings(null, questions);
    expect(sets.find((s) => s.key === "ghost")).toEqual({ key: "ghost", label: "ghost" });
  });
});

describe("parseQuestionList — the /leads/setup editor", () => {
  it("preserves a submitted slug verbatim (re-wording keeps the statistics bucket)", () => {
    const out = parseQuestionList([{ slug: "size", label: "Új szöveg a mérethez?" }]);
    expect(out).toEqual([{ slug: "size", label: "Új szöveg a mérethez?" }]);
  });
  it("slugifies only when no slug was submitted", () => {
    const out = parseQuestionList([{ label: "Mekkora a felület?" }]);
    expect(out).toEqual([{ slug: "mekkora_a_felulet", label: "Mekkora a felület?" }]);
  });
  it("rejects duplicate slugs", () => {
    expect(parseQuestionList([{ slug: "a", label: "A?" }, { slug: "a", label: "Más A?" }]))
      .toMatchObject({ error: expect.stringContaining("azonos azonosítót") });
  });
  it("rejects an empty list", () => {
    expect(parseQuestionList([])).toEqual({ error: "Legalább egy kérdés kell" });
  });
  it("rejects a choice question with no options", () => {
    expect(parseQuestionList([{ slug: "a", label: "A?", type: "choice" }]))
      .toMatchObject({ error: expect.stringContaining("Válaszlehetőség nélküli") });
  });
});

describe("parseAnswers", () => {
  it("keeps known slugs, trims, drops blanks", () => {
    expect(parseAnswers({ a: "  igen  ", b: "   " }, Q)).toEqual({ a: "igen" });
  });
  it("rejects an unknown slug — it would sit in the JSON invisibly", () => {
    expect(parseAnswers({ zzz: "x" }, Q)).toMatchObject({ error: expect.stringContaining("Ismeretlen") });
  });
  it("rejects a non-string or over-long answer", () => {
    expect(parseAnswers({ a: 42 }, Q)).toHaveProperty("error");
    expect(parseAnswers({ a: "x".repeat(ANSWER_MAX + 1) }, Q)).toHaveProperty("error");
  });
});

describe("answersFrom tolerates whatever is in the column", () => {
  it("null / array / non-string values", () => {
    expect(answersFrom(null)).toEqual({});
    expect(answersFrom([1, 2])).toEqual({});
    expect(answersFrom({ a: "x", b: 3, c: "  " })).toEqual({ a: "x" });
  });
});

describe("answerSourcesFrom tolerates whatever is in the column", () => {
  it("null / garbage never throws, returns {}", () => {
    for (const bad of [null, undefined, "x", 42, [1, 2], { a: { form: { value: 5 } } }]) {
      expect(() => answerSourcesFrom(bad)).not.toThrow();
      expect(answerSourcesFrom(bad)).toEqual({});
    }
  });
});

describe("withAnswers + effectiveAnswers — provenance", () => {
  it("a form answer then a setter answer for the same slug: both retained, setter wins", () => {
    let sources = withAnswers({}, "form", { size: "200 m2" });
    sources = withAnswers(sources, "setter", { size: "nagyobb, kb 300" });
    expect(sources.size.form?.value).toBe("200 m2");
    expect(sources.size.setter?.value).toBe("nagyobb, kb 300");
    expect(effectiveAnswers(sources)).toEqual({ size: "nagyobb, kb 300" });
  });

  it("a blank setter answer removes the setter record, falls back to the form answer", () => {
    let sources = withAnswers({}, "form", { size: "200 m2" });
    sources = withAnswers(sources, "setter", { size: "nagyobb" });
    sources = withAnswers(sources, "setter", { size: "" });
    expect(sources.size.setter).toBeUndefined();
    expect(sources.size.form?.value).toBe("200 m2");
    expect(effectiveAnswers(sources)).toEqual({ size: "200 m2" });
  });

  it("only touches the slugs submitted — an untouched slug keeps both records", () => {
    let sources = withAnswers({}, "form", { size: "200 m2", postcode: "9024" });
    sources = withAnswers(sources, "setter", { size: "nagyobb" });
    sources = withAnswers(sources, "setter", { postcode: "9025" });
    expect(sources.size.form?.value).toBe("200 m2");
    expect(sources.size.setter?.value).toBe("nagyobb");
    expect(sources.postcode.form?.value).toBe("9024");
    expect(sources.postcode.setter?.value).toBe("9025");
  });
});

describe("legacyAnswers", () => {
  it("returns exactly the qualification entries with no record in sources", () => {
    const sources = withAnswers({}, "form", { size: "200 m2" });
    const qualification = { size: "200 m2", postcode: "9024", timing: "this_week" };
    expect(legacyAnswers(sources, qualification)).toEqual({ postcode: "9024", timing: "this_week" });
  });
});

describe("effectiveAnswers feeds computeTier the same as a raw answer map", () => {
  it("pins that provenance does not change tiering", () => {
    const raw = {
      gate: "task", situation: "company", concrete: "wall", goal: "condition",
      size: "200 m2", postcode: "9024", timing: "this_week", own_device: "maybe",
    };
    const sources = withAnswers({}, "form", raw);
    expect(computeTier(effectiveAnswers(sources))).toBe(computeTier(raw));
    expect(computeTier(effectiveAnswers(sources))).toBe("A");
  });
});
