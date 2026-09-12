import { describe, it, expect } from "vitest";
import {
  parseScriptBlocks,
  formatScriptBlocks,
  scriptVariantsFromSettings,
  DEFAULT_SCRIPT_VARIANTS,
  SCRIPT_VARIANT_MAX,
  type ScriptVariant,
} from "./scripts";

const ok = (r: ScriptVariant[] | { error: string }) => {
  if ("error" in r) throw new Error(`expected variants, got: ${r.error}`);
  return r;
};

describe("parseScriptBlocks", () => {
  it("reads one block per variant, key|label on the first line, the rest is the body", () => {
    const v = ok(parseScriptBlocks("a|Rövid nyitás\nJó napot, X vagyok.\nVan most futó projekt?\n---\nb|Esettel nyit\nGC Rieber: 600 m² két óra alatt."));
    expect(v).toHaveLength(2);
    expect(v[0]).toEqual({ key: "a", label: "Rövid nyitás", body: "Jó napot, X vagyok.\nVan most futó projekt?" });
    expect(v[1].key).toBe("b");
  });

  it("slugifies the key from the label when no explicit key is given", () => {
    const v = ok(parseScriptBlocks("Rövid nyitás\nszöveg"));
    expect(v[0].key).toBe("rovid_nyitas");
  });

  it("keeps a body with blank lines intact", () => {
    const v = ok(parseScriptBlocks("a|A\nelső\n\nmásodik"));
    expect(v[0].body).toBe("első\n\nmásodik");
  });

  it("allows a variant with no body at all", () => {
    const v = ok(parseScriptBlocks("a|Csak név"));
    expect(v[0].body).toBe("");
  });

  it("rejects two variants that would share one key — they would merge each other's stats", () => {
    const r = parseScriptBlocks("a|Első\nx\n---\na|Második\ny");
    expect(r).toHaveProperty("error");
  });

  it("rejects an empty editor and more than the allowed number of variants", () => {
    expect(parseScriptBlocks("   \n\n")).toHaveProperty("error");
    const many = Array.from({ length: SCRIPT_VARIANT_MAX + 1 }, (_, i) => `k${i}|N${i}\nbody`).join("\n---\n");
    expect(parseScriptBlocks(many)).toHaveProperty("error");
  });

  it("skips an empty block between separators instead of erroring", () => {
    const v = ok(parseScriptBlocks("a|A\nx\n---\n\n---\nb|B\ny"));
    expect(v.map((s) => s.key)).toEqual(["a", "b"]);
  });

  it("round-trips through formatScriptBlocks", () => {
    const original = ok(parseScriptBlocks("a|Első\nsor egy\nsor kettő\n---\nb|Második\nmás"));
    expect(ok(parseScriptBlocks(formatScriptBlocks(original)))).toEqual(original);
  });
});

describe("scriptVariantsFromSettings", () => {
  const good: ScriptVariant[] = [{ key: "a", label: "A", body: "x" }];

  it("returns the stored variants", () => {
    expect(scriptVariantsFromSettings({ scriptVariants: good })).toEqual(good);
  });

  it("falls back to the placeholders for anything malformed — a bad settings row must not take the page down", () => {
    for (const bad of [null, undefined, {}, { scriptVariants: "x" }, { scriptVariants: [] },
                       { scriptVariants: [{ key: "a" }] }, { scriptVariants: [{ key: "", label: "A", body: "" }] },
                       { scriptVariants: [{ key: "NAGY BETŰ", label: "A", body: "" }] }]) {
      expect(scriptVariantsFromSettings(bad)).toEqual(DEFAULT_SCRIPT_VARIANTS);
    }
  });

  it("drops a duplicate key rather than merging two variants' stats", () => {
    const dupe = [{ key: "a", label: "A", body: "" }, { key: "a", label: "Másik A", body: "" }];
    expect(scriptVariantsFromSettings({ scriptVariants: dupe })).toEqual([dupe[0]]);
  });

  it("ships placeholders that are visibly placeholders", () => {
    for (const v of DEFAULT_SCRIPT_VARIANTS) expect(v.label).toMatch(/^TODO/);
  });
});
