import { describe, it, expect } from "vitest";
import {
  decide, hasNewsletterOptIn, segmentFor, templateBlock,
  type Activity, type EnrollmentState, type NurtureLead, type Step,
} from "./plan";

const lead = (over: Partial<NurtureLead> = {}): NurtureLead => ({
  intent: "service_concrete", status: "new", outcome: "open", convertedDealId: null, qualification: null, customFields: null, ...over,
});

describe("segmentFor", () => {
  it("maps intents", () => {
    expect(segmentFor(lead({ intent: "service_concrete" }))).toBe("service");
    expect(segmentFor(lead({ intent: "rental" }))).toBe("device");
    expect(segmentFor(lead({ intent: "purchase" }))).toBe("device");
    expect(segmentFor(lead({ intent: "service_vague" }))).toBe("info");
    expect(segmentFor(lead({ intent: "unknown" }))).toBeNull();
    expect(segmentFor(lead({ intent: "device" }))).toBeNull();
    expect(segmentFor(lead({ intent: null }))).toBeNull();
  });
  it("never nurtures won, ordered or converted", () => {
    expect(segmentFor(lead({ status: "won" }))).toBeNull();
    expect(segmentFor(lead({ status: "ordered" }))).toBeNull();
    expect(segmentFor(lead({ convertedDealId: 5 }))).toBeNull();
    expect(segmentFor(lead({ outcome: "won" }))).toBeNull();
  });
  it("lost or recall only with nurture_list or opt-in", () => {
    expect(segmentFor(lead({ status: "lost" }))).toBeNull();
    expect(segmentFor(lead({ status: "recall" }))).toBeNull();
    expect(segmentFor(lead({ outcome: "lost" }))).toBeNull();
    expect(segmentFor(lead({ status: "lost", customFields: { nurture_list: "info" } }))).toBe("lost");
    expect(segmentFor(lead({ status: "recall", qualification: { newsletter_opt_in: "yes" } }))).toBe("lost");
    expect(segmentFor(lead({ outcome: "lost", qualification: { newsletter_opt_in: true } }))).toBe("lost");
  });
});

describe("hasNewsletterOptIn", () => {
  const q = (v: unknown) => hasNewsletterOptIn({ qualification: { newsletter_opt_in: v } });
  it("accepts explicit yes only", () => {
    for (const v of ["yes", "true", "on", "igen", true, " Igen "]) expect(q(v)).toBe(true);
    for (const v of ["no", "", false, "nem", 0, null]) expect(q(v)).toBe(false);
    expect(hasNewsletterOptIn({ qualification: {} })).toBe(false);
    expect(hasNewsletterOptIn({ qualification: null })).toBe(false);
  });
});

describe("decide", () => {
  const DAY = 86_400_000;
  const t0 = new Date("2026-11-01T10:00:00Z");
  const at = (days: number) => new Date(t0.getTime() + days * DAY);
  const steps: Step[] = [
    { position: 1, delayDays: 0, templateKey: "a", audience: "all" },
    { position: 2, delayDays: 7, templateKey: "b", audience: "all" },
  ];
  const en = (over: Partial<EnrollmentState> = {}): EnrollmentState => ({
    status: "active", nextPosition: 1, enrolledAt: t0, pausedAt: null, resumedAt: null, lastSentAt: null, ...over,
  });
  const act = (days: number, kind: Activity["kind"] = "reply"): Activity => ({ at: at(days), kind });

  it("pauses on activity after enrolment", () => {
    expect(decide(en(), steps, [act(1, "booking")], false, at(2))).toEqual({ kind: "pause", reason: "booking" });
  });
  it("ignores activity before enrolment, and before resumedAt", () => {
    expect(decide(en(), steps, [act(-1)], false, at(1)).kind).toBe("send");
    expect(decide(en({ resumedAt: at(5) }), steps, [act(3)], false, at(6)).kind).toBe("send");
    expect(decide(en({ resumedAt: at(5) }), steps, [act(5.5)], false, at(6)).kind).toBe("pause");
  });
  it("resumes only after 14 quiet days", () => {
    const paused = en({ status: "paused", pausedAt: at(1) });
    expect(decide(paused, steps, [act(1)], false, at(14)).kind).toBe("none");
    expect(decide(paused, steps, [act(1)], false, at(15)).kind).toBe("resume");
  });
  it("is inert when stopped or completed", () => {
    expect(decide(en({ status: "stopped" }), steps, [], false, at(9)).kind).toBe("none");
    expect(decide(en({ status: "completed" }), steps, [], false, at(9)).kind).toBe("none");
  });
  it("sends the first due step", () => {
    const d = decide(en(), steps, [], false, at(1));
    expect(d).toMatchObject({ kind: "send", step: { position: 1 } });
  });
  it("skips steps by audience and reports them", () => {
    const s: Step[] = [
      { position: 1, delayDays: 0, templateKey: "a", audience: "opt_in" },
      { position: 2, delayDays: 0, templateKey: "b", audience: "non_opt_in" },
    ];
    const d1 = decide(en(), s, [], false, at(1));
    expect(d1).toMatchObject({ kind: "send", step: { position: 2 }, skipped: [{ position: 1 }] });
    const d2 = decide(en(), s, [], true, at(1));
    expect(d2).toMatchObject({ kind: "send", step: { position: 1 }, skipped: [] });
  });
  it("waits: not_due, frequency_cap, recent_call", () => {
    expect(decide(en({ nextPosition: 2 }), steps, [], false, at(3))).toMatchObject({ kind: "wait", reason: "not_due" });
    expect(decide(en({ nextPosition: 2, lastSentAt: at(5) }), steps, [], false, at(8))).toMatchObject({ kind: "wait", reason: "frequency_cap" });
    expect(decide(en({ nextPosition: 2, lastSentAt: at(0) }), steps, [], false, at(8)).kind).toBe("send");
    // call before enrolment so it does not pause
    const call: Activity = { at: new Date(t0.getTime() - 3_600_000), kind: "call" };
    expect(decide(en(), steps, [call], false, new Date(t0.getTime() + 3_600_000))).toMatchObject({ kind: "wait", reason: "recent_call" });
    expect(decide(en(), steps, [call], false, new Date(t0.getTime() + 49 * 3_600_000)).kind).toBe("send");
  });
  it("completes when no steps remain", () => {
    expect(decide(en({ nextPosition: 3 }), steps, [], false, at(30))).toMatchObject({ kind: "complete" });
  });
});

describe("templateBlock", () => {
  const ok = { status: "approved", approvedByAron: true, requiresAsset: null };
  it("gates", () => {
    expect(templateBlock(null, [])).toBe("template_missing");
    expect(templateBlock({ ...ok, status: "proposal" }, [])).toBe("not_approved");
    expect(templateBlock({ ...ok, approvedByAron: false }, [])).toBe("not_approved");
    expect(templateBlock({ ...ok, requiresAsset: "guide" }, [])).toBe("asset_missing:guide");
    expect(templateBlock({ ...ok, requiresAsset: "guide" }, ["guide"])).toBeNull();
    expect(templateBlock(ok, [])).toBeNull();
  });
});
