// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validateTranscript, TRANSCRIPT_MAX } from "./calls";

describe("validateTranscript", () => {
  it("rejects empty / whitespace-only transcripts", () => {
    expect(validateTranscript("")).toEqual({ error: "Az átirat nem lehet üres" });
    expect(validateTranscript("   \n  ")).toEqual({ error: "Az átirat nem lehet üres" });
  });

  it("rejects a transcript over the max length", () => {
    const res = validateTranscript("a".repeat(TRANSCRIPT_MAX + 1));
    expect(res).toEqual({ error: "Az átirat túl hosszú" });
  });

  it("accepts a trimmed non-empty transcript at or under the max", () => {
    expect(validateTranscript("  hello  ")).toEqual({ text: "hello" });
    expect(validateTranscript("a".repeat(TRANSCRIPT_MAX))).toEqual({ text: "a".repeat(TRANSCRIPT_MAX) });
  });
});
