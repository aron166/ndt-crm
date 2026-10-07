import { describe, it, expect, vi, beforeEach } from "vitest";

const { db } = vi.hoisted(() => ({ db: { assistantCall: { aggregate: vi.fn() }, tenant: { findUnique: vi.fn() } } }));
vi.mock("@/lib/db", () => ({ db }));
import { DEFAULT_MONTHLY_TOKEN_CAP, capFromSettings, capState, monthStart, monthUsage } from "./cap";

const agg = (p: number, c: number, cost = 0, n = 1) =>
  db.assistantCall.aggregate.mockResolvedValue({ _count: { _all: n }, _sum: { promptTokens: p, completionTokens: c, costUsd: cost } });
beforeEach(() => { db.assistantCall.aggregate.mockReset(); db.tenant.findUnique.mockReset().mockResolvedValue({ settings: {} }); });

describe("capFromSettings", () => {
  it.each([[null], [{}], [{ assistantMonthlyTokenCap: 0 }], [{ assistantMonthlyTokenCap: -5 }], [{ assistantMonthlyTokenCap: 1.5 }], [{ assistantMonthlyTokenCap: "9" }]])("default for %j", (s) => {
    expect(capFromSettings(s)).toBe(DEFAULT_MONTHLY_TOKEN_CAP);
  });
  it("uses a valid integer", () => expect(capFromSettings({ assistantMonthlyTokenCap: 500 })).toBe(500));
});

describe("monthStart", () => {
  it("summer month starts at 22:00Z the day before (CEST)", () => {
    expect(monthStart(new Date("2026-07-15T10:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });
  it("winter month starts at 23:00Z (CET)", () => {
    expect(monthStart(new Date("2026-12-15T10:00:00Z")).toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });
  it("month containing the DST change (October) starts in CEST", () => {
    expect(monthStart(new Date("2026-10-31T12:00:00Z")).toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });
  it("boundary: 23:30Z on the last day is already next Budapest month", () => {
    expect(monthStart(new Date("2026-09-30T22:30:00Z")).toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(monthStart(new Date("2026-09-30T21:30:00Z")).toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });
});

describe("usage and cap", () => {
  it("sums tokens, tenant scoped, since month start", async () => {
    agg(100, 50, 0.5, 3);
    expect(await monthUsage(1, new Date("2026-10-07T10:00:00Z"))).toEqual({ calls: 3, tokens: 150, costUsd: 0.5 });
    expect(db.assistantCall.aggregate.mock.calls[0][0].where).toMatchObject({ tenantId: 1, purpose: { not: "execute" } });
  });
  it("exceeded exactly at the cap", async () => {
    db.tenant.findUnique.mockResolvedValue({ settings: { assistantMonthlyTokenCap: 150 } });
    agg(100, 50);
    expect(await capState(1)).toEqual({ used: 150, cap: 150, exceeded: true });
    agg(100, 49);
    expect((await capState(1)).exceeded).toBe(false);
  });
});
