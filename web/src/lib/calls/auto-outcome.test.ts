import { describe, it, expect } from "vitest";
import { decideAutoOutcome, isAutoOutcome, type ParsedCall } from "./auto-outcome";

function parsed(over: Partial<ParsedCall>): ParsedCall {
  return { outcome: "no_answer", confidence: 1, note: "x", ...over };
}

describe("decideAutoOutcome", () => {
  it("never auto-applies a human act, even at confidence 1.0", () => {
    for (const outcome of ["meeting_booked", "not_interested", "disqualified"] as const) {
      const d = decideAutoOutcome(parsed({ outcome, confidence: 1 }));
      expect(d).toEqual({ apply: false, reason: "human_act" });
    }
  });

  it("rejects below the 0.8 threshold as low_confidence", () => {
    const d = decideAutoOutcome(parsed({ outcome: "no_answer", confidence: 0.79 }));
    expect(d).toEqual({ apply: false, reason: "low_confidence" });
  });

  it("applies at exactly 0.8", () => {
    const d = decideAutoOutcome(parsed({ outcome: "no_answer", confidence: 0.8 }));
    expect(d).toEqual({ apply: true, reason: null });
  });

  it("callback_requested with no callback_at is incomplete", () => {
    const d = decideAutoOutcome(parsed({ outcome: "callback_requested", confidence: 1 }));
    expect(d).toEqual({ apply: false, reason: "incomplete" });
  });

  it("callback_requested with a past callback_at is incomplete", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    const past = new Date(now.getTime() - 3_600_000).toISOString();
    const d = decideAutoOutcome(parsed({ outcome: "callback_requested", confidence: 1, callback_at: past }), now);
    expect(d).toEqual({ apply: false, reason: "incomplete" });
  });

  it("callback_requested with a future callback_at applies", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    const future = new Date(now.getTime() + 3_600_000).toISOString();
    const d = decideAutoOutcome(parsed({ outcome: "callback_requested", confidence: 1, callback_at: future }), now);
    expect(d).toEqual({ apply: true, reason: null });
  });
});

describe("isAutoOutcome", () => {
  it("is true for an outcome row with a confidence", () => {
    expect(isAutoOutcome({ outcome: "no_answer", autoConfidence: 0.9 })).toBe(true);
  });

  it("is false for a plain transcribed row", () => {
    expect(isAutoOutcome({ outcome: "transcribed", autoConfidence: 0.9 })).toBe(false);
  });

  it("is false without a confidence", () => {
    expect(isAutoOutcome({ outcome: "no_answer", autoConfidence: null })).toBe(false);
  });
});

describe("isAutoOutcome on a parse that answered a dictated transcript", () => {
  it("stays true when the row supersedes the transcript it answered", () => {
    // The badge on the lead timeline is gated on this. Gating it on
    // supersedesInteractionId instead would hide the badge on exactly the
    // /drive dictation flow the feature exists for.
    expect(isAutoOutcome({ outcome: "callback_requested", autoConfidence: 0.91 })).toBe(true);
  });
  it("is false for a human correction, which carries no confidence", () => {
    expect(isAutoOutcome({ outcome: "not_interested", autoConfidence: null })).toBe(false);
  });
});
