import { describe, expect, it } from "vitest";
import { groupQueue, queueWhere } from "./queue-data";

// 2026-11-10 12:00 Budapest (CET, UTC+1) = 11:00Z
const now = new Date("2026-11-10T11:00:00Z");
const r = (id: number, iso: string | null) => ({ id, nextDue: iso ? new Date(iso) : null });

describe("groupQueue", () => {
  it("buckets by Budapest day in urgency order", () => {
    const rows = [
      r(1, "2026-11-09T09:00:00Z"), r(2, "2026-11-10T07:00:00Z"), r(3, "2026-11-10T15:00:00Z"),
      r(4, "2026-11-11T09:00:00Z"), r(5, "2026-11-15T09:00:00Z"), r(6, null),
    ];
    const g = groupQueue(rows, now);
    expect(g.map((x) => x.key)).toEqual(["overdue", "today", "tomorrow", "later", "none"]);
    expect(g.map((x) => x.rows.map((y) => y.id))).toEqual([[1, 2], [3], [4], [5], [6]]);
  });

  it("omits empty groups", () => {
    expect(groupQueue([r(1, null)], now).map((x) => x.key)).toEqual(["none"]);
  });

  it("treats 23:30Z on Nov 10 as Nov 11 in Budapest (tomorrow)", () => {
    const g = groupQueue([r(1, "2026-11-10T23:30:00Z")], now);
    expect(g[0].key).toBe("tomorrow");
  });
});

describe("groupQueue on DST change days", () => {
  it.each([
    ["2026-10-25 (CEST->CET)", "2026-10-25T10:00:00Z", "2026-10-25T22:30:00Z", "2026-10-25T23:30:00Z"],
    ["2027-03-28 (CET->CEST)", "2027-03-28T10:00:00Z", "2027-03-28T21:30:00Z", "2027-03-28T22:30:00Z"],
  ])("%s: same Budapest day is today, next local midnight is tomorrow", (_n, nowIso, lateIso, nextIso) => {
    const g = groupQueue([r(1, lateIso), r(2, nextIso)], new Date(nowIso));
    expect(g.map((x) => [x.key, x.rows.map((y) => y.id)])).toEqual([["today", [1]], ["tomorrow", [2]]]);
  });
});

describe("queueWhere", () => {
  it("filters by owner only when given", () => {
    expect(queueWhere(7)).toMatchObject({ tenantId: 1, assignedToId: 7 });
    expect(queueWhere(null)).not.toHaveProperty("assignedToId");
    expect(queueWhere(-1)).toMatchObject({ assignedToId: -1 });
  });
  it("excludes recall and lost, keeps null status", () => {
    const w = queueWhere(null);
    expect(w.OR).toContainEqual({ status: null });
    const notIn = (w.OR[1] as { status: { notIn: string[] } }).status.notIn;
    expect(notIn).toEqual(expect.arrayContaining(["recall", "lost"]));
  });
});
