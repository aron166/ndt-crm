import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/app-key-auth", () => ({
  validateAppKey: vi.fn(),
  rateLimit: vi.fn(() => true),
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/reports/weekly", async () => {
  const actual = await vi.importActual<typeof import("@/lib/reports/weekly")>("@/lib/reports/weekly");
  return { ...actual, getWeeklyReport: vi.fn() };
});

import { GET } from "./route";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { getWeeklyReport } from "@/lib/reports/weekly";

const KEY = { keyId: 3, tenantId: 7, appSlug: "reporter" };
const req = (qs = "") => new Request(`http://x/api/reports/weekly${qs}`);

const REPORT = {
  from: new Date("2026-09-30T00:00:00Z"),
  to: new Date("2026-10-07T00:00:00Z"),
  leadsBySourceTier: [{ source: "web", tier: "A", count: 2 }],
  leadsTotal: 2,
  tierA: {
    total: 1, withoutTask: 0, awaitingCall: 0, contacted: 1, medianMinutes: 12, p90Minutes: 12,
    leads: [{
      leadId: 5, companyName: "Acme", createdAt: new Date("2026-10-01T08:00:00Z"),
      taskAt: new Date("2026-10-01T08:00:00Z"), firstCallAt: new Date("2026-10-01T08:12:00Z"),
      minutesToContact: 12,
    }],
  },
  callOutcomes: [{ outcome: "meeting_booked", count: 1 }],
  callsTotal: 1,
  demos: { booked: 1, scheduled: 2, held: 1 },
  stageTransitions: [{ from: "new", to: "contacted", count: 3 }],
  suppression: { added: 4, draftsCancelled: 1 },
  topCompanies: [{ companyId: 9, name: "Acme", touches: 6, lastTouchAt: new Date("2026-10-06T10:00:00Z") }],
};

beforeEach(() => {
  vi.clearAllMocks();
  (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
  (rateLimit as ReturnType<typeof vi.fn>).mockReturnValue(true);
  (getWeeklyReport as ReturnType<typeof vi.fn>).mockResolvedValue(REPORT);
});

describe("GET /api/reports/weekly", () => {
  it("401 without a key", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    expect(getWeeklyReport).not.toHaveBeenCalled();
  });

  it("429 when rate limited", async () => {
    (rateLimit as ReturnType<typeof vi.fn>).mockReturnValue(false);
    expect((await GET(req())).status).toBe(429);
    expect(getWeeklyReport).not.toHaveBeenCalled();
  });

  it("400 when from >= to", async () => {
    const res = await GET(req("?from=2026-10-07&to=2026-10-01"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid window");
    expect(body.details.reason).toMatch(/before/);
    expect(getWeeklyReport).not.toHaveBeenCalled();
  });

  it("400 on a garbage date", async () => {
    const res = await GET(req("?from=banana"));
    expect(res.status).toBe(400);
    expect((await res.json()).details.reason).toBe("Invalid date");
  });

  it("200 uses the key's tenant and maps to snake_case", async () => {
    const res = await GET(req("?from=2026-09-30&to=2026-10-07"));
    expect(res.status).toBe(200);
    expect(getWeeklyReport).toHaveBeenCalledWith(7, {
      from: new Date("2026-09-30"),
      to: new Date("2026-10-07"),
    });
    const b = await res.json();
    expect(b.ok).toBe(true);
    expect(b.leads_created.total).toBe(2);
    expect(b.leads_created.by_source_tier[0]).toEqual({ source: "web", tier: "A", count: 2 });
    expect(b.tier_a.without_task).toBe(0);
    expect(b.tier_a.median_minutes).toBe(12);
    expect(b.tier_a.leads[0].minutes_to_contact).toBe(12);
    expect(b.tier_a.leads[0].lead_id).toBe(5);
    expect(b.call_outcomes.by_outcome[0].outcome).toBe("meeting_booked");
    expect(b.suppression.drafts_cancelled).toBe(1);
    expect(b.top_companies[0].last_touch_at).toBe("2026-10-06T10:00:00.000Z");
  });

  it("500 when the report throws", async () => {
    (getWeeklyReport as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
  });
});
