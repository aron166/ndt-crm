import { describe, expect, it } from "vitest";
import { groupQueue } from "./queue-data";

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
