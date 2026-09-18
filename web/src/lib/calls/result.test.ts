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

  const parsedPayload = { outcome: "no_answer", confidence: 0.9, note: "Nem vette fel" };

  it("accepts lead_id + parsed + call_id and coerces lead_id", () => {
    const r = callResultSchema.safeParse({
      lead_id: "9", call_id: "abc", transcript: "Hello", parsed: parsedPayload,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.lead_id).toBe(9);
  });

  it("rejects parsed without lead_id", () => {
    const r = callResultSchema.safeParse({
      company_id: 5, call_id: "abc", transcript: "Hello", parsed: parsedPayload,
    });
    expect(r.success).toBe(false);
  });

  it("rejects when neither company_id nor lead_id is present", () => {
    const r = callResultSchema.safeParse({ transcript: "Hello" });
    expect(r.success).toBe(false);
  });

  it("rejects when both company_id and lead_id are present", () => {
    const r = callResultSchema.safeParse({ company_id: 5, lead_id: 9, call_id: "abc", transcript: "Hello" });
    expect(r.success).toBe(false);
  });

  it("rejects lead_id without parsed", () => {
    const r = callResultSchema.safeParse({ lead_id: 9, transcript: "Hello" });
    expect(r.success).toBe(false);
  });

  it("rejects parsed without call_id", () => {
    const r = callResultSchema.safeParse({ lead_id: 9, transcript: "Hello", parsed: parsedPayload });
    expect(r.success).toBe(false);
  });

  it("accepts a company-only body without parsed or call_id", () => {
    const r = callResultSchema.safeParse({ company_id: 5, transcript: "Hello" });
    expect(r.success).toBe(true);
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
