import { describe, it, expect } from "vitest";
import { completeIntArrayField, partialStringField } from "./partial-json";

const answer = 'Szia "Áron"\n\\ út/\té kész';
const full = JSON.stringify({ read_item_ids: [3, 14], answer, actions: [] });

describe("partialStringField", () => {
  it("grows monotonically chunk by chunk to the final value", () => {
    let prev = "";
    let seen = false;
    for (let n = 1; n <= full.length; n++) {
      const p = partialStringField(full.slice(0, n), "answer");
      if (p === null) { expect(seen).toBe(false); continue; }
      seen = true;
      expect(p.startsWith(prev)).toBe(true);
      expect(answer.startsWith(p)).toBe(true);
      prev = p;
    }
    expect(prev).toBe(answer);
  });
  it("drops incomplete escapes and decodes \\u after 4 digits", () => {
    expect(partialStringField('{"answer":"a\\', "answer")).toBe("a");
    expect(partialStringField('{"answer":"a\\u00', "answer")).toBe("a");
    expect(partialStringField('{"answer":"a\\u00e9b', "answer")).toBe("aéb");
    expect(partialStringField('{"answer":"', "answer")).toBe("");
    expect(partialStringField('{"answer":', "answer")).toBeNull();
  });
  it("stops at the closing quote", () => {
    expect(partialStringField('{"answer":"ok","x":"y"}', "answer")).toBe("ok");
  });
  it("does not match a key inside a string value or nested object", () => {
    const b = JSON.stringify({ note: 'x "answer": "fake', nested: { answer: "no" }, answer: "real" });
    expect(partialStringField(b, "answer")).toBe("real");
    expect(partialStringField('{"note":"x \\"answer\\": \\"fake', "answer")).toBeNull();
  });
});

describe("completeIntArrayField", () => {
  it("returns only once the array is closed", () => {
    expect(completeIntArrayField('{"read_item_ids":[3, 1', "read_item_ids")).toBeNull();
    expect(completeIntArrayField('{"read_item_ids":[3, 14],"a', "read_item_ids")).toEqual([3, 14]);
    expect(completeIntArrayField('{"read_item_ids":[]', "read_item_ids")).toEqual([]);
    expect(completeIntArrayField('{"a":"x","read_item_ids":', "read_item_ids")).toBeNull();
  });
});
