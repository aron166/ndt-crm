import { describe, it, expect } from "vitest";
import { gateOn, templateIsStale, type StepTemplate } from "./template";

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
