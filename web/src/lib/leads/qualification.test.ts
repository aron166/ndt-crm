import { describe, it, expect } from "vitest";
import {
  DEFAULT_QUALIFICATION_QUESTIONS, questionsFromSettings, parseQuestionLines,
  questionsToLines, parseAnswers, answersFrom, QUESTION_MAX, ANSWER_MAX,
} from "./qualification";

const Q = [{ slug: "a", label: "A?" }, { slug: "b", label: "B?" }];

describe("questionsFromSettings — a bad settings row must never take the page down", () => {
  it("falls back to the placeholders", () => {
    for (const bad of [null, undefined, {}, { qualificationQuestions: "x" }, { qualificationQuestions: [] },
                       { qualificationQuestions: [{ slug: "a" }] }, { qualificationQuestions: [{ label: "" , slug: "a" }] }]) {
      expect(questionsFromSettings(bad)).toEqual(DEFAULT_QUALIFICATION_QUESTIONS);
    }
  });
  it("takes a valid list and drops duplicate slugs (they'd share one answer)", () => {
    expect(questionsFromSettings({ qualificationQuestions: Q })).toEqual(Q);
    expect(questionsFromSettings({ qualificationQuestions: [...Q, { slug: "a", label: "again" }] })).toEqual(Q);
  });
  it("refuses an unbounded list", () => {
    const many = Array.from({ length: QUESTION_MAX + 1 }, (_, i) => ({ slug: `q${i}`, label: `Q${i}` }));
    expect(questionsFromSettings({ qualificationQuestions: many })).toEqual(DEFAULT_QUALIFICATION_QUESTIONS);
  });
});

describe("parseQuestionLines — the /leads/setup editor", () => {
  it("slug|label, bare label, comments and blanks", () => {
    expect(parseQuestionLines("a|A?\n\n# note\nMekkora a felület?")).toEqual([
      { slug: "a", label: "A?" },
      { slug: "mekkora_a_felulet", label: "Mekkora a felület?" },
    ]);
  });
  it("round-trips through questionsToLines", () => {
    expect(parseQuestionLines(questionsToLines(Q))).toEqual(Q);
  });
  it("rejects an empty list and colliding slugs", () => {
    expect(parseQuestionLines("  \n# only a comment")).toEqual({ error: "Legalább egy kérdés kell" });
    expect(parseQuestionLines("Mit? \nmit|Más szöveg")).toMatchObject({ error: expect.stringContaining("azonos azonosítót") });
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
