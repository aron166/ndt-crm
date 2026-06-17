import { describe, it, expect } from "vitest";
import { callResultSchema, composeCallNotes } from "./result";

describe("callResultSchema", () => {
  it("accepts a transcript-only payload and coerces ids", () => {
    const r = callResultSchema.safeParse({ company_id: "5", transcript: "Hello" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.company_id).toBe(5);
  });

  it("rejects when neither transcript nor analysis is present", () => {
    const r = callResultSchema.safeParse({ company_id: 5, duration_sec: 10 });
    expect(r.success).toBe(false);
  });

  it("rejects a missing/invalid company_id", () => {
    expect(callResultSchema.safeParse({ transcript: "x" }).success).toBe(false);
    expect(callResultSchema.safeParse({ company_id: -1, transcript: "x" }).success).toBe(false);
  });
});

describe("composeCallNotes", () => {
  it("formats duration as m:ss and orders analysis before transcript", () => {
    const notes = composeCallNotes({
      durationSec: 204,
      analysis: "Érdeklődik",
      transcript: "teljes szöveg",
    });
    expect(notes).toContain("Időtartam: 3:24");
    expect(notes.indexOf("[AI elemzés]")).toBeLessThan(notes.indexOf("[Átirat]"));
  });

  it("works with only a transcript", () => {
    expect(composeCallNotes({ transcript: "x" })).toBe("[Átirat]\nx");
  });
});
