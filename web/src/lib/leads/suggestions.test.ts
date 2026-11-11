import { describe, it, expect } from "vitest";
import { suggestNextSteps } from "./suggestions";
import { DEFAULT_TRANSITIONS } from "./lifecycle";

const EXCLUDED = /^(sla_missed|attempts_exhausted|inbound_received|recall_date_reached|lead_lost|demo_followed_up|payment_reminded|offer_silent)$|_expired$|_twice$/;
const STAGES = ["new", "contacting", "discovery_booked", "qualified", "offer_sent", "demo_booked", "demo_done", "ordered", "recall", "won", "lost"];
const keys = (stage: string) => suggestNextSteps(stage).map((s) => s.key);

describe("suggestNextSteps", () => {
  it("returns the proposed steps per stage", () => {
    expect(keys("new")).toEqual(["call", "book-survey", "qualified"]);
    expect(keys("contacting")).toEqual(["call", "book-survey", "qualified"]);
    expect(keys("discovery_booked")).toEqual(["meeting-fit", "meeting-no-show"]);
    expect(keys("qualified")).toEqual(["send-offer", "book-demo"]);
    expect(keys("offer_sent")).toEqual(["book-demo", "offer-accepted", "remind"]);
    expect(keys("demo_booked")).toEqual(["demo-done", "remind"]);
    expect(keys("demo_done")).toEqual(["ordered", "call-decision"]);
    expect(keys("ordered")).toEqual(["signoff", "won"]);
    expect(keys("recall")).toEqual(["call-again"]);
  });

  it("closed stages: none for won, only reopen for lost", () => {
    expect(keys("won")).toEqual([]);
    expect(suggestNextSteps("lost")).toEqual([{ key: "reopen", label: "Újranyitás", kind: "move", event: "lead_reopened", to: "new" }]);
    expect(keys("unknown")).toEqual([]);
  });

  it("is capped at 3 and never offers an excluded event", () => {
    for (const st of STAGES) {
      const list = suggestNextSteps(st);
      expect(list.length).toBeLessThanOrEqual(3);
      for (const s of list) if (s.event) expect(s.event).not.toMatch(EXCLUDED);
    }
  });

  it("every event exists in the transition table for that stage, with the right target", () => {
    for (const st of STAGES) {
      for (const s of suggestNextSteps(st)) {
        if (!s.event) continue;
        const t = DEFAULT_TRANSITIONS.find((x) => x.from === st && x.event === s.event);
        expect(t, `${st}/${s.event}`).toBeTruthy();
        expect(s.to).toBe(t!.to);
      }
    }
  });

  it("drops call and email steps the lead cannot use", () => {
    expect(suggestNextSteps("new", { hasPhone: false }).map((s) => s.kind)).not.toContain("call");
    expect(suggestNextSteps("offer_sent", { hasEmail: false }).map((s) => s.kind)).not.toContain("email");
  });
});
