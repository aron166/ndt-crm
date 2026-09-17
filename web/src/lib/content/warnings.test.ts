import { describe, it, expect } from "vitest";
import { extractWarnings } from "./warnings";

describe("extractWarnings", () => {
  it("strips JÓVÁHAGYÁSRA VÁR scaffolding, keeps the real question, forWhom either", () => {
    // growth/campaigns/cold-email-v0/drafts/a-hid.md line 3
    const md = "⚠️ **JÓVÁHAGYÁSRA VÁR — Áron / Péter.** Egyetlen sor sem megy ki jóváhagyás nélkül.";
    const w = extractWarnings(md);
    expect(w).toEqual([
      { question: "Áron / Péter. Egyetlen sor sem megy ki jóváhagyás nélkül.", forWhom: "either" },
    ]);
  });

  it("plain Áron-only line, no scaffolding to strip", () => {
    // growth/campaigns/cold-email-v0/FRAMEWORK.md line 207
    const md = "⚠️ Áron: az aláírás pontos cégformája, címe és a jogi lábléc (leiratkozás) még hiányzik.";
    const w = extractWarnings(md);
    expect(w).toEqual([
      {
        question: "Áron: az aláírás pontos cégformája, címe és a jogi lábléc (leiratkozás) még hiányzik.",
        forWhom: "aron",
      },
    ]);
  });

  it("multi-line bullet warning continues onto the indented continuation line, stops at blank line", () => {
    // growth/campaigns/sales-kit/demo-ajanlat-DRAFT.md, the "áram" bullet
    const md = [
      "- **áram** a helyszínen ⚠️ *(megerősítendő: a műszer akkumulátoros üzemideje mennyire fedi le",
      "  az 1 órát + a kiértékelést — Péter).*",
      "",
      "## 7. Mi történik a demó után",
    ].join("\n");
    const w = extractWarnings(md);
    expect(w).toEqual([
      {
        question:
          "(megerősítendő: a műszer akkumulátoros üzemideje mennyire fedi le az 1 órát + a kiértékelést — Péter).",
        forWhom: "peter",
      },
    ]);
  });

  it("⚠ inside a markdown table row cell, trailing pipe stripped", () => {
    // growth/campaigns/cold-email-v0/CL_HISTORY.md line 91
    const md =
      "| **HÍDTECHNIKA KFT.** `hidtechnika` | 2015-08-05 „ISMERTETŐ ELKÜLDVE\", contact not made. " +
      'Contact on file: TÁRNOKI András, műszaki titkár, hidtechnika@chello.hu (⚠️ likely stale address). |';
    const w = extractWarnings(md);
    expect(w).toEqual([{ question: "likely stale address).", forWhom: "either" }]);
  });

  it("dedupes identical questions (case-insensitive), keeps first occurrence", () => {
    const md = ["⚠️ Áron dönti el az árat.", "⚠️ áron dönti el az árat."].join("\n");
    const w = extractWarnings(md);
    expect(w).toHaveLength(1);
    expect(w[0].question).toBe("Áron dönti el az árat.");
  });

  it("ignores a bare ⚠ with no words after it", () => {
    expect(extractWarnings("⚠️")).toEqual([]);
    expect(extractWarnings("Some line.\n⚠️\n\nOther line.")).toEqual([]);
  });

  it("truncates to 500 chars on a word boundary and appends …", () => {
    const longText = "szó ".repeat(200).trim(); // well over 500 chars
    const md = `⚠️ ${longText}`;
    const w = extractWarnings(md);
    expect(w).toHaveLength(1);
    expect(w[0].question.length).toBeLessThanOrEqual(500);
    expect(w[0].question.endsWith("…")).toBe(true);
    expect(w[0].question.endsWith(" …")).toBe(false);
  });
});
