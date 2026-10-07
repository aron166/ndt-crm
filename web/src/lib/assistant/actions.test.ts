import { describe, it, expect } from "vitest";
import { decisionBody, describeProposal, parseActionProposal, type ActionProposal } from "./actions";
import { REVIEW_REASONS } from "@/lib/content/reasons";

const j = (o: unknown) => JSON.stringify(o);

describe("parseActionProposal", () => {
  it("accepts each type", () => {
    const reason = REVIEW_REASONS[0];
    const cases: unknown[] = [
      { type: "review", itemId: 1, verdict: "approve" },
      { type: "review", itemId: 1, verdict: "changes", comment: "Javítsa", reason },
      { type: "answer_decision", checkId: 2, answer: "Igen" },
      { type: "create_decision", question: "Mehet?", context: "ctx", options: ["a", "b"], deadline: "2026-10-20" },
      { type: "note", itemId: 1, body: "jegyzet" },
      { type: "ticket", draft: { title: "Hiba van", body: "Leírás a hibáról", label: "bug", repo: "ndt-crm" } },
      { type: "none", message: "Nem egyértelmű" },
    ];
    for (const c of cases) {
      const p = parseActionProposal(j(c));
      expect(p?.type, j(c)).toBe((c as { type: string }).type);
    }
  });
  it("defaults decidedBy to either", () => {
    const p = parseActionProposal(j({ type: "create_decision", question: "Mehet?", context: "c", options: ["a"] }));
    expect(p).toMatchObject({ decidedBy: "either" });
  });
  it("tolerates a code fence and surrounding prose", () => {
    const p = parseActionProposal("Itt:\n```json\n" + j({ type: "note", itemId: 4, body: "x" }) + "\n```");
    expect(p).toMatchObject({ type: "note", itemId: 4 });
  });
  it("rejects changes/rewrite without comment or reason", () => {
    const reason = REVIEW_REASONS[0];
    expect(parseActionProposal(j({ type: "review", itemId: 1, verdict: "changes" }))).toBeNull();
    expect(parseActionProposal(j({ type: "review", itemId: 1, verdict: "rewrite", comment: "Újra" , reason }))).not.toBeNull();
    expect(parseActionProposal(j({ type: "review", itemId: 1, verdict: "changes", comment: "Javítsa" }))).toBeNull();
    expect(parseActionProposal(j({ type: "review", itemId: 1, verdict: "changes", reason }))).toBeNull();
  });
  it("rejects unknown type, garbage and a bad deadline", () => {
    expect(parseActionProposal(j({ type: "delete_all" }))).toBeNull();
    expect(parseActionProposal("nem json")).toBeNull();
    expect(parseActionProposal(j({ type: "create_decision", question: "Mehet?", context: "c", options: ["a"], deadline: "10/20/2026" }))).toBeNull();
  });
});

describe("describeProposal", () => {
  it("describes each type", () => {
    expect(describeProposal({ type: "review", itemId: 3, verdict: "approve" }, { itemTitle: "Cím" })).toBe("Jóváhagyás: #3 Cím");
    expect(describeProposal({ type: "review", itemId: 3, verdict: "rewrite", comment: "x", reason: REVIEW_REASONS[0] })).toBe("Újraírást kér: #3");
    expect(describeProposal({ type: "answer_decision", checkId: 5, answer: "ok" })).toBe("Válasz a kérdésre: #5");
    expect(describeProposal({ type: "answer_decision", checkId: 5, answer: "ok" }, { question: "Q?" })).toBe("Válasz a kérdésre: Q?");
    expect(describeProposal({ type: "note", itemId: 2, body: "b" }, { itemTitle: "T" })).toBe("Jegyzet: #2 T");
    expect(describeProposal({ type: "none", message: "hiányzik" })).toBe("hiányzik");
  });
});

describe("decisionBody", () => {
  const base: Extract<ActionProposal, { type: "create_decision" }> = {
    type: "create_decision", question: "Q", context: "Háttér szöveg", options: ["Egy", "Kettő"], decidedBy: "either",
  };
  it("numbers options and omits optional sections", () => {
    const b = decisionBody(base);
    expect(b).toContain("## Háttér\nHáttér szöveg");
    expect(b).toContain("1. Egy\n2. Kettő");
    expect(b).not.toContain("## Javaslat");
    expect(b).not.toContain("## Határidő");
  });
  it("includes recommendation and deadline", () => {
    const b = decisionBody({ ...base, recommendation: "Az elsőt", deadline: "2026-10-20" });
    expect(b).toContain("## Javaslat\nAz elsőt");
    expect(b).toContain("## Határidő\n2026-10-20");
  });
});
