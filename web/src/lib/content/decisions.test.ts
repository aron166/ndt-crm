import { describe, it, expect } from "vitest";
import { groupDecisions } from "./queries";

const NOW = new Date("2026-09-19T10:00:00Z");
const item = (id: number) => ({ id, title: `Item ${id}`, category: "post", status: "in_review" });

function row(id: number, forWhom: string, createdAt: Date) {
  return { id, question: `Q${id}`, source: "rule", forWhom, createdAt, item: item(id) };
}

describe("groupDecisions", () => {
  it("groups by for_whom, an unknown value landing in either", () => {
    const rows = [
      row(1, "aron", NOW),
      row(2, "peter", NOW),
      row(3, "either", NOW),
      row(4, "someone_else", NOW),
    ];
    const q = groupDecisions(rows, NOW);
    expect(q.aron.map((r) => r.checkId)).toEqual([1]);
    expect(q.peter.map((r) => r.checkId)).toEqual([2]);
    expect(q.either.map((r) => r.checkId)).toEqual([3, 4]);
  });

  it("preserves oldest-first order (as the query supplies it) within a bucket", () => {
    const older = new Date("2026-09-10T10:00:00Z");
    const newer = new Date("2026-09-18T10:00:00Z");
    // Rows arrive already orderBy createdAt asc, same as getDecisionQueue's query.
    const rows = [row(1, "aron", older), row(2, "aron", newer)];
    const q = groupDecisions(rows, NOW);
    expect(q.aron.map((r) => r.checkId)).toEqual([1, 2]);
  });

  it("daysWaiting is 0 for something created today, floors otherwise, never negative", () => {
    const today = new Date(NOW.getTime() - 3 * 60 * 60 * 1000); // 3h ago, same day
    const fourDaysAgo = new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1000 - 60_000);
    const future = new Date(NOW.getTime() + 60_000); // clock skew guard
    const q = groupDecisions([row(1, "either", today), row(2, "either", fourDaysAgo), row(3, "either", future)], NOW);
    expect(q.either.find((r) => r.checkId === 1)!.daysWaiting).toBe(0);
    expect(q.either.find((r) => r.checkId === 2)!.daysWaiting).toBe(4);
    expect(q.either.find((r) => r.checkId === 3)!.daysWaiting).toBe(0);
  });

  it("total counts rows across every bucket", () => {
    const q = groupDecisions([row(1, "aron", NOW), row(2, "peter", NOW), row(3, "either", NOW)], NOW);
    expect(q.total).toBe(3);
  });
});
