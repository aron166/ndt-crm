import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { copyRuleBreaks, parseSegmentCopy } from "./copy-file";

const CTA = "Ha egy kicsit is felkeltette az érdeklődését, nem bonyolítom: válaszoljon annyit, hogy „érdekel”, és felhívom.";
const fenceOf = (s: string) => "```\n" + s + "\n```";
const MD = [
  "Minden levél teste ugyanígy zárul:", "", fenceOf("{{CTA}}\n\n{{sender_name}}"), "",
  "## Segment A (generálkivitelezők)", "", "Tárgy: Vágás előtt", "", fenceOf("{{greeting}}\n\nSzöveg A."), "",
  "## Segment B (tervezők)", "", "Tárgy: Ára", "", fenceOf("{{greeting}}\n\nA mérés ára 90 000 Ft."), "",
  "## Segment H (magánszemélyek)", "", "Nem hideg levél.", "",
  "## Utánkövetés (egyetlen)", "", fenceOf("{{greeting}}\n\nRöviden."), "",
].join("\n");

describe("parseSegmentCopy", () => {
  it("builds one touch-1 item per segment with the closing block and the CTA, and refuses rule breaks", () => {
    const r = parseSegmentCopy(MD, CTA);
    expect(r.items).toEqual([{ segment: "A", label: "generálkivitelezők", subject: "Vágás előtt", body: `{{greeting}}\n\nSzöveg A.\n\n${CTA}\n\n{{sender_name}}` }]);
    expect(r.refused.map((x) => x.what)).toEqual(["B szegmens", "H szegmens", "Utánkövetés (minden szegmens)"]);
    expect(r.refused[0].reason).toContain("ár vagy díj");
  });
  it("refuses everything without a CTA", () => {
    expect(parseSegmentCopy(MD, " ").items).toEqual([]);
  });
});

describe("copyRuleBreaks", () => {
  it("names each launch rule", () => {
    expect(copyRuleBreaks("Hatósági engedély kell? „érdekel”")).toEqual(["„engedély”"]);
    expect(copyRuleBreaks("Garanciát vállalunk. „érdekel”")).toEqual(["„garancia”"]);
    expect(copyRuleBreaks("Az első ilyen mérés. „érdekel”")).toEqual(["„első” (minősítés nélkül tilos)"]);
    expect(copyRuleBreaks("Pontosság ±5 mm. „érdekel”")).toEqual(["plusz-mínusz pontosság"]);
    expect(copyRuleBreaks("Foglaljon időpontot. „érdekel”")).toEqual(["az ügyfél foglal (mi foglalunk, soha az ügyfél)"]);
    expect(copyRuleBreaks("Írjon vissza.")).toEqual(["nincs „érdekel” válasz kérés"]);
    expect(copyRuleBreaks("Radarral mérünk, a járat előtt. Válaszoljon: „érdekel”")).toEqual([]);
  });
});

// The real file, when it is on this machine: what tonight's load would carry (counts in the PR body).
const REAL = "/home/aron166/Projects/workspace/docs/birdsview/launch-2026-11/demo/EMAIL.md";
describe.runIf(fs.existsSync(REAL))("EMAIL.md (launch 2026-11)", () => {
  it("yields the seven mailed segments A-G, all clean", () => {
    const r = parseSegmentCopy(fs.readFileSync(REAL, "utf8"), CTA);
    expect(r.items.map((i) => i.segment)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    for (const i of r.items) expect(i.body).toContain("„érdekel”");
  });
});
