import { describe, it, expect } from "vitest";
import { gateOn, templateIsStale, validTemplateVersion, type StepTemplate } from "./template";

const live = (liveVersionId: number): StepTemplate => ({
  itemId: 1, title: "1. érintés", status: "live", liveVersionId,
});
const notLive = (status: string): StepTemplate => ({
  itemId: 1, title: "1. érintés", status, liveVersionId: null,
});

describe("gateOn", () => {
  it("passes an EMPTY slot: round one was drafted before templates existed", () => {
    expect(gateOn(null)).toEqual({ ok: true, liveVersionId: null });
  });

  it("passes a live slot and hands back the version drafts may use", () => {
    expect(gateOn(live(42))).toEqual({ ok: true, liveVersionId: 42 });
  });

  it("blocks every non-live status: somebody put a template there on purpose", () => {
    for (const status of ["draft", "in_review", "changes_requested", "rewrite_requested", "ai_working", "archived"]) {
      const res = gateOn(notLive(status));
      expect(res.ok, status).toBe(false);
    }
  });

  it("blocks a slot that claims live but has no live version", () => {
    expect(gateOn({ itemId: 1, title: "x", status: "live", liveVersionId: null }).ok).toBe(false);
  });
});

describe("templateIsStale", () => {
  const unsent = (templateVersionId: number | null) => ({ templateVersionId, sentAt: null });

  it("a sent draft is never stale: history must not move under it", () => {
    expect(templateIsStale({ templateVersionId: 1, sentAt: new Date() }, live(2))).toBe(false);
  });

  it("an unsent draft built from an older version is stale", () => {
    expect(templateIsStale(unsent(1), live(2))).toBe(true);
  });

  it("an unsent draft built from the current version is not stale", () => {
    expect(templateIsStale(unsent(2), live(2))).toBe(false);
  });

  it("a draft with no recorded template is unknown, not stale", () => {
    expect(templateIsStale(unsent(null), live(2))).toBe(false);
  });

  it("no slot, or a slot that is not live, means nothing to compare against", () => {
    expect(templateIsStale(unsent(1), null)).toBe(false);
    expect(templateIsStale(unsent(1), notLive("in_review"))).toBe(false);
  });
});

describe("validTemplateVersion", () => {
  const allowed = new Map([
    [41, { campaign: "cold-email-v0", step: 1 }],
    [42, { campaign: "cold-email-v0", step: 2 }],
    [43, { campaign: "masik-kampany", step: 1 }],
    [44, { campaign: null, step: null }], // a version of an item in no slot
  ]);

  it("stores a version that really belongs to this campaign and step", () => {
    expect(validTemplateVersion(41, allowed, "cold-email-v0", 1)).toBe(41);
  });

  it("drops a version belonging to another STEP of the same campaign", () => {
    expect(validTemplateVersion(42, allowed, "cold-email-v0", 1)).toBeNull();
  });

  it("drops a version belonging to another CAMPAIGN", () => {
    expect(validTemplateVersion(43, allowed, "cold-email-v0", 1)).toBeNull();
  });

  it("drops a version whose item sits in no slot at all", () => {
    expect(validTemplateVersion(44, allowed, "cold-email-v0", 1)).toBeNull();
  });

  it("drops an unknown id: another tenant's version never reaches the map", () => {
    expect(validTemplateVersion(999, allowed, "cold-email-v0", 1)).toBeNull();
  });

  it("null and undefined mean no claim, not an error", () => {
    expect(validTemplateVersion(null, allowed, "cold-email-v0", 1)).toBeNull();
    expect(validTemplateVersion(undefined, allowed, "cold-email-v0", 1)).toBeNull();
  });
});
