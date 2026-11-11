import { describe, it, expect } from "vitest";
import { parseMetrics } from "./metrics";

describe("hand-entered content numbers (item 6)", () => {
  it("keeps the five known keys as whole non-negative numbers; blanks drop out", () => {
    expect(parseMetrics({ impressions: "1200", clicks: " 14 ", leads: "", reactions: 3 })).toEqual({ impressions: 1200, clicks: 14, reactions: 3 });
  });
  it("refuses a negative, a fraction, text or an unknown key", () => {
    expect(parseMetrics({ clicks: "-1" })).toEqual({ error: "A számok nem negatív egészek" });
    expect(parseMetrics({ clicks: "1.5" })).toEqual({ error: "A számok nem negatív egészek" });
    expect(parseMetrics({ clicks: "sok" })).toEqual({ error: "A számok nem negatív egészek" });
    expect(parseMetrics({ spend: "10" })).toEqual({ error: "Ismeretlen mérőszám: spend" });
  });
});
