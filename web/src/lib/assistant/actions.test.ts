import { describe, it, expect } from "vitest";
import { MODEL_RESPONSE_SCHEMA, NAV_PATH_RE, decisionBody, describeProposal, parseActionProposal, parseModelResponse, toProposals, type ActionProposal } from "./actions";
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

describe("NAV_PATH_RE", () => {
  it("accepts and rejects", () => {
    for (const ok of ["/marketing", "/marketing?status=draft&mine=0&view=list", "/marketing/decisions#42", "/marketing/12", "/patchnotes", "/reports/weekly"]) expect(NAV_PATH_RE.test(ok), ok).toBe(true);
    for (const bad of ["//evil.com", "/marketing/../x", "javascript:alert(1)", "https://x", "/marketing/decisions#x", "/admin"]) expect(NAV_PATH_RE.test(bad), bad).toBe(false);
  });
});

describe("MODEL_RESPONSE_SCHEMA", () => {
  it("is strict with read_item_ids first and answer second", () => {
    const s = MODEL_RESPONSE_SCHEMA as any;
    expect(Object.keys(s.properties)).toEqual(["read_item_ids", "answer", "actions"]);
    expect(s.required).toEqual(Object.keys(s.properties));
    const it = s.properties.actions.items;
    expect(it.additionalProperties).toBe(false);
    expect(it.required).toEqual(Object.keys(it.properties));
    expect(it.properties.verdict.enum).toContain(null);
  });
});

describe("parseModelResponse", () => {
  it("is tolerant: fences, defaults", () => {
    expect(parseModelResponse('```json\n{"answer":"Szia"}\n```')).toEqual({ read_item_ids: [], answer: "Szia", actions: [] });
    expect(parseModelResponse('{"read_item_ids":[1,2],"answer":"x","actions":[{"type":"waiting"}]}')).toMatchObject({ read_item_ids: [1, 2], actions: [{ type: "waiting" }] });
  });
  it("rejects missing or empty answer and junk", () => {
    expect(parseModelResponse('{"answer":"  "}')).toBeNull();
    expect(parseModelResponse('{"actions":[]}')).toBeNull();
    expect(parseModelResponse("nope")).toBeNull();
  });
});

describe("toProposals", () => {
  const base = { item_id: null, check_id: null, verdict: null, reason: null, comment: null, path: null, text: null, title: null, context: null, options: null, recommendation: null, deadline: null, decided_by: null, label: null };
  it("maps each flat type", () => {
    const { proposals, dropped } = toProposals([
      { ...base, type: "review", item_id: 1, verdict: "changes", comment: "Javítsa" },
      { ...base, type: "review", item_id: 1, verdict: "approve" },
      { ...base, type: "answer_decision", check_id: 2, text: "Igen" },
      { ...base, type: "create_decision", title: "Mehet?", context: "ctx", options: ["a"] },
      { ...base, type: "note", item_id: 3, text: "jegyzet" },
      { ...base, type: "ticket", title: "Hiba van", text: "Leírás a hibáról" },
      { ...base, type: "open_item", item_id: 4 },
      { ...base, type: "navigate", path: "/patchnotes" },
      { ...base, type: "waiting" },
    ]);
    expect(dropped).toBe(0);
    expect(proposals.map((p) => p.type)).toEqual(["review", "review", "answer_decision", "create_decision", "note", "ticket", "open_item", "navigate", "waiting"]);
    expect(proposals[0]).toMatchObject({ reason: "other" });
    expect(proposals[3]).toMatchObject({ decidedBy: "either" });
    expect(proposals[5]).toMatchObject({ draft: { label: "backlog", repo: "ndt-crm" } });
  });
  it("drops invalid, unknown and non-object actions", () => {
    const r = toProposals([{ ...base, type: "navigate", path: "//evil.com" }, { ...base, type: "none" }, { ...base, type: "open_item" }, "x", null]);
    expect(r).toEqual({ proposals: [], dropped: 5 });
  });
  it("describes client types", () => {
    expect(describeProposal({ type: "open_item", itemId: 12 }, { itemTitle: "Cím" })).toBe("Megnyitom: #12 Cím");
    expect(describeProposal({ type: "navigate", path: "/patchnotes" })).toBe("Odaviszem: /patchnotes");
    expect(describeProposal({ type: "waiting" })).toBe("Megnézem, mi vár Önre");
  });
});
