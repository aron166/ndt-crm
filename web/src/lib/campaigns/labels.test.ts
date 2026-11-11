import { describe, it, expect } from "vitest";
import { channelsFor, defaultSteps, filterByType, groupByCity, isContentOnly, outreachStatsHref, stepLine, uiBatchId } from "./labels";
import { stepsFitKind } from "./rules";
import { summarize, weekStart } from "./hub";

describe("campaign kinds in the UI", () => {
  it("every kind's default steps pass the server's shape check; the sequence opens with the e-mail", () => {
    for (const k of ["sequence", "cold_call", "cold_email", "ad", "organic"] as const) {
      expect(stepsFitKind(k, defaultSteps(k).map((s, i) => ({ channel: s.channel, position: i + 1 })))).toBeNull();
    }
    expect(defaultSteps("sequence").map((s) => s.channel)).toEqual(["email", "call"]);
  });
  it("ad and organic are content only, with no step channels to offer", () => {
    expect(isContentOnly("ad")).toBe(true);
    expect(isContentOnly(null)).toBe(true);
    expect(isContentOnly("sequence")).toBe(false);
    expect(channelsFor("organic")).toEqual([]);
    expect(channelsFor("cold_call")).toEqual(["call"]);
  });
  it("type tabs filter by kind; pre-v2 rows (null, content) show under Mind and Marketing (régi)", () => {
    const rows = [{ kind: "sequence" }, { kind: null }, { kind: "ad" }, { kind: "content" }];
    expect(filterByType(rows, "all")).toHaveLength(4);
    expect(filterByType(rows, "ad")).toEqual([{ kind: "ad" }]);
    expect(filterByType(rows, "marketing")).toEqual([{ kind: null }, { kind: "content" }]);
  });
  it("the old dashboard URL lands on the hub Kiküldés view with its filters", () => {
    expect(outreachStatsHref({ campaign: "corvid-w1", sender: "2", wave: undefined })).toBe("/campaigns?type=outreach&campaign=corvid-w1&sender=2");
    expect(outreachStatsHref(new URLSearchParams("wave=3&x=1"))).toBe("/campaigns?type=outreach&wave=3");
    expect(outreachStatsHref({})).toBe("/campaigns?type=outreach");
  });
  it("step lines read like the mockup", () => {
    expect(stepLine({ channel: "call", waitDays: 3, audienceRule: "no_reply" })).toBe("Hívás, 3 munkanap után, akik nem válaszoltak");
    expect(stepLine({ channel: "email", wait_days: 0 })).toBe("E-mail");
  });
  it("the call list groups by city in list order", () => {
    const g = groupByCity([{ id: 1, city: "XI. kerület" }, { id: 2, city: null, company: { city: "Győr" } }, { id: 3, city: "XI. kerület" }]);
    expect(g.map((x) => [x.city, x.items.map((i) => i.id)])).toEqual([["XI. kerület", [1, 3]], ["Győr", [2]]]);
  });
  it("a UI batch id is a valid batch key", () => {
    expect(uiBatchId(new Date(2026, 10, 11, 9, 5, 7), () => 0)).toBe("ui-20261111-090507-0000");
    expect(uiBatchId(new Date(), () => 0.1)).not.toBe(uiBatchId(new Date(), () => 0.2));
    expect(/^[A-Za-z0-9_-]{1,64}$/.test(uiBatchId(new Date()))).toBe(true);
  });
});

describe("hub summary", () => {
  const row = (o: Record<string, unknown>) => ({ id: 1, slug: "a", name: "A", kind: "sequence", status: "draft", owner: null, audience: 0, queued: 0, today: null, leadsThisWeek: 0, assetsInReview: 0, stepCount: 0, ...o });
  it("counts running, approvable drafts, calls today, leads and assets", () => {
    const s = summarize([
      row({ status: "running", today: 15, leadsThisWeek: 3, assetsInReview: 1 }),
      row({ status: "draft", stepCount: 2, queued: 40 }),
      row({ status: "draft", stepCount: 0, queued: 5 }), // no steps: not approvable
      row({ status: "paused", stepCount: 1, queued: 0 }), // nobody queued: not approvable
    ] as never);
    expect(s).toEqual({ running: 1, awaiting: 1, callsToday: 15, leadsThisWeek: 3, assetsInReview: 1 });
  });
  it("the week starts Monday 00:00 Budapest", () => {
    expect(weekStart(new Date("2026-11-11T09:00:00Z")).toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(weekStart(new Date("2026-11-09T00:30:00+01:00")).toISOString()).toBe("2026-11-08T23:00:00.000Z");
  });
});
