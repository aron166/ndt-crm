import { describe, it, expect } from "vitest";
import { applyEvent, statusFromReviews, isClaimStale, type ItemState, type ContentEvent } from "./transitions";
import { CLAIM_TTL_MS, CONTENT_STATUSES, type ContentStatus } from "./types";

const NOW = new Date("2026-09-17T10:00:00Z");
const FRESH = new Date(NOW.getTime() - 60_000);
const STALE = new Date(NOW.getTime() - CLAIM_TTL_MS - 1);
const R = [2, 3];

const st = (status: ContentStatus, over: Partial<ItemState> = {}): ItemState => ({
  status, currentVersionId: 10, liveVersionId: null, claimedAt: null, claimedFrom: null, ...over,
});
const reviews = (...pairs: [number, "approve" | "changes" | "rewrite"][]): ContentEvent => ({
  type: "reviews_changed", reviewers: R, reviews: pairs.map(([reviewerUserId, verdict]) => ({ reviewerUserId, verdict })),
});

describe("version_created — any edit resets to in_review", () => {
  for (const s of CONTENT_STATUSES.filter((x) => x !== "archived")) {
    it(`${s} → in_review`, () => {
      const r = applyEvent(st(s, { claimedAt: FRESH, claimedFrom: "changes_requested" }), { type: "version_created", versionId: 11 });
      expect(r).toMatchObject({ ok: true, state: { status: "in_review", currentVersionId: 11, claimedAt: null, claimedFrom: null } });
    });
  }
  it("archived → conflict", () => {
    expect(applyEvent(st("archived"), { type: "version_created", versionId: 11 })).toMatchObject({ ok: false, code: "conflict" });
  });
  it("a live item keeps serving its live version while the new one is reviewed", () => {
    const r = applyEvent(st("live", { liveVersionId: 10 }), { type: "version_created", versionId: 11 });
    expect(r).toMatchObject({ ok: true, state: { status: "in_review", liveVersionId: 10, currentVersionId: 11 } });
  });
});

describe("reviews_changed — the table", () => {
  const table: [string, ContentEvent, ContentStatus, boolean][] = [
    ["no reviews", reviews(), "in_review", false],
    ["one approve", reviews([2, "approve"]), "in_review", false],
    ["both approve", reviews([2, "approve"], [3, "approve"]), "live", true],
    ["approve + changes", reviews([2, "approve"], [3, "changes"]), "changes_requested", false],
    ["approve + rewrite", reviews([2, "approve"], [3, "rewrite"]), "rewrite_requested", false],
    ["changes + rewrite → rewrite wins", reviews([2, "changes"], [3, "rewrite"]), "rewrite_requested", false],
    ["changes alone", reviews([3, "changes"]), "changes_requested", false],
    ["non-reviewer approvals ignored", reviews([2, "approve"], [99, "approve"]), "in_review", false],
    ["non-reviewer rewrite ignored", reviews([2, "approve"], [3, "approve"], [99, "rewrite"]), "live", true],
  ];
  for (const [name, ev, status, wentLive] of table) {
    it(name, () => {
      const r = applyEvent(st("in_review"), ev);
      expect(r).toMatchObject({ ok: true, state: { status }, wentLive });
      if (status === "live" && r.ok) expect(r.state.liveVersionId).toBe(10);
    });
  }
  it("empty reviewer list is never live", () => {
    expect(statusFromReviews([], [{ reviewerUserId: 2, verdict: "approve" }])).toBe("in_review");
  });
  it("re-approving an already-live version is not a new live switch", () => {
    const r = applyEvent(st("live", { liveVersionId: 10 }), reviews([2, "approve"], [3, "approve"]));
    expect(r).toMatchObject({ ok: true, wentLive: false });
  });
  it("a live item with a new version keeps liveVersionId on changes", () => {
    const r = applyEvent(st("in_review", { liveVersionId: 9 }), reviews([2, "changes"]));
    expect(r).toMatchObject({ ok: true, state: { status: "changes_requested", liveVersionId: 9 } });
  });
  it("cannot review while the AI works or when archived", () => {
    expect(applyEvent(st("ai_working", { claimedAt: FRESH }), reviews([2, "approve"]))).toMatchObject({ ok: false, code: "conflict" });
    expect(applyEvent(st("archived"), reviews([2, "approve"]))).toMatchObject({ ok: false, code: "conflict" });
  });
  it("no current version is invalid", () => {
    expect(applyEvent(st("draft", { currentVersionId: null }), reviews())).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("claim", () => {
  it.each(["changes_requested", "rewrite_requested"] as const)("from %s → ai_working, remembers where from", (s) => {
    expect(applyEvent(st(s), { type: "claim", now: NOW })).toMatchObject({
      ok: true, state: { status: "ai_working", claimedAt: NOW, claimedFrom: s },
    });
  });
  it.each(["draft", "in_review", "live", "archived"] as const)("from %s → conflict", (s) => {
    expect(applyEvent(st(s), { type: "claim", now: NOW })).toMatchObject({ ok: false, code: "conflict" });
  });
  it("a fresh claim cannot be taken again (409)", () => {
    expect(applyEvent(st("ai_working", { claimedAt: FRESH, claimedFrom: "changes_requested" }), { type: "claim", now: NOW }))
      .toMatchObject({ ok: false, code: "conflict" });
  });
  it("a stale claim can be re-taken and keeps the original origin", () => {
    expect(applyEvent(st("ai_working", { claimedAt: STALE, claimedFrom: "changes_requested" }), { type: "claim", now: NOW }))
      .toMatchObject({ ok: true, state: { status: "ai_working", claimedAt: NOW, claimedFrom: "changes_requested" } });
  });
});

describe("release_stale", () => {
  it("fresh claim → unchanged", () => {
    const s = st("ai_working", { claimedAt: FRESH, claimedFrom: "rewrite_requested" });
    expect(applyEvent(s, { type: "release_stale", now: NOW })).toMatchObject({ ok: true, state: s });
  });
  it("stale claim → back to where it came from", () => {
    expect(applyEvent(st("ai_working", { claimedAt: STALE, claimedFrom: "changes_requested" }), { type: "release_stale", now: NOW }))
      .toMatchObject({ ok: true, state: { status: "changes_requested", claimedAt: null, claimedFrom: null } });
  });
  it("not ai_working → unchanged", () => {
    expect(applyEvent(st("in_review"), { type: "release_stale", now: NOW })).toMatchObject({ ok: true, state: { status: "in_review" } });
  });
  it("isClaimStale boundary", () => {
    expect(isClaimStale(new Date(NOW.getTime() - CLAIM_TTL_MS), NOW)).toBe(false);
    expect(isClaimStale(STALE, NOW)).toBe(true);
    expect(isClaimStale(null, NOW)).toBe(false);
  });
});

describe("archive", () => {
  it.each(CONTENT_STATUSES)("%s → archived", (s) => {
    expect(applyEvent(st(s, { claimedAt: FRESH }), { type: "archive" })).toMatchObject({ ok: true, state: { status: "archived", claimedAt: null } });
  });
});
