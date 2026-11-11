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

describe("hub type tab labels", () => {
  it("the folded-in views show no count (the old list keeps archived rows the hub count skips)", async () => {
    const { typeTabLabel } = await import("./labels");
    expect(typeTabLabel("marketing", "Marketing (régi)", 0)).toBe("Marketing (régi)");
    expect(typeTabLabel("outreach", "Kiküldés", 3)).toBe("Kiküldés");
    expect(typeTabLabel("sequence", "Sorozat", 2)).toBe("Sorozat 2");
  });
});

describe("what an agent is asked for (item 6, specification request)", () => {
  it("names a missing offer, audience, steps and step assets; nothing when all is there", async () => {
    const { missingForSpec } = await import("./labels");
    expect(missingForSpec({ kind: "sequence", brief: null, steps: [] })).toEqual(["cél, ajánlat", "célközönség", "lépések"]);
    expect(missingForSpec({ kind: "sequence", brief: { offer: "x", audience: "y" }, steps: [{ position: 1, channel: "email", contentItemId: null }, { position: 2, channel: "call", contentItemId: 7 }] }))
      .toEqual(["1. lépés anyaga (E-mail)"]);
    expect(missingForSpec({ kind: "ad", brief: { offer: "x", audience: "y" }, steps: [] })).toEqual([]);
  });
});

describe("sequence editor rows (item 4): a wait is its own row, stored as the next step's wait", () => {
  it("folds waits into the next touch and unfolds them back", async () => {
    const { foldRows, unfoldSteps } = await import("./labels");
    const rows = [
      { kind: "email" as const, condition: "all" as const, content_item_id: 5 },
      { kind: "wait" as const, days: 2 },
      { kind: "wait" as const, days: 1 },
      { kind: "call" as const, condition: "no_reply" as const, content_item_id: null },
    ];
    const steps = foldRows(rows);
    expect(steps).toEqual({ steps: [
      { channel: "email", wait_days: 0, audience_rule: "all", content_item_id: 5 },
      { channel: "call", wait_days: 3, audience_rule: "no_reply", content_item_id: null },
    ] });
    expect(unfoldSteps((steps as { steps: never[] }).steps)).toEqual([
      { kind: "email", condition: "all", content_item_id: 5 },
      { kind: "wait", days: 3 },
      { kind: "call", condition: "no_reply", content_item_id: null },
    ]);
  });
  it("a trailing wait or waits past 60 working days are refused", async () => {
    const { foldRows } = await import("./labels");
    expect(foldRows([{ kind: "email", condition: "all" }, { kind: "wait", days: 2 }])).toEqual({ error: "A sorozat végén álló várakozás nem csinál semmit" });
    expect(foldRows([{ kind: "wait", days: 40 }, { kind: "wait", days: 30 }, { kind: "call", condition: "all" }])).toEqual({ error: "Egy lépés előtt legfeljebb 60 munkanap várakozás lehet" });
  });
});
