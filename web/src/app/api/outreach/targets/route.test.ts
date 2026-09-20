import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/app-key-auth", () => ({
  validateAppKey: vi.fn(),
  rateLimit: vi.fn(() => true),
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/marketing/audience-query", () => ({ audienceWhere: vi.fn() }));

const { db } = vi.hoisted(() => ({
  db: {
    campaign: { findFirst: vi.fn() },
    savedView: { findFirst: vi.fn() },
    company: { findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db }));

import { GET } from "./route";
import { validateAppKey } from "@/lib/app-key-auth";
import { audienceWhere } from "@/lib/marketing/audience-query";

const KEY = { keyId: 1, tenantId: 1, appSlug: "outreach-drafter" };

function req(params: string) {
  return new Request(`http://x/api/outreach/targets?${params}`);
}

// Every case below assumes tenant 1, campaign "wave1", and an empty result set
// unless the test cares about what companies come back (out of scope here -
// this file is about the audience resolution/fail-open behaviour).
beforeEach(() => {
  vi.clearAllMocks();
  (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
  db.campaign.findFirst.mockResolvedValue(null);
  db.savedView.findFirst.mockResolvedValue(null);
  db.company.findMany.mockResolvedValue([]);
  db.company.count.mockResolvedValue(0);
});

describe("GET /api/outreach/targets - audience resolution", () => {
  it("no campaign row (legacy free-string key): audience null, unrestricted where - byte-identical to before the feature", async () => {
    db.campaign.findFirst.mockResolvedValue(null);

    const res = await GET(req("campaign=TESZT"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audience).toBeNull();
    expect(db.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ AND: expect.anything() }) }),
    );
  });

  it("campaign row with no audienceViewId: audience null, no savedView lookup", async () => {
    db.campaign.findFirst.mockResolvedValue({
      id: 9, name: "Wave 1", slug: "wave1", senderUserId: null, currentWave: null,
      audienceViewId: null, isArchived: false,
    });

    const res = await GET(req("campaign=wave1"));
    expect(res.status).toBe(200);
    expect(db.savedView.findFirst).not.toHaveBeenCalled();
  });

  it("audienceViewId set but the saved view has been deleted: 409, nothing queried further - a restriction that vanished must be louder than one that never existed", async () => {
    db.campaign.findFirst.mockResolvedValue({
      id: 9, name: "Wave 1", slug: "wave1", senderUserId: null, currentWave: null,
      audienceViewId: 5, isArchived: false,
    });
    db.savedView.findFirst.mockResolvedValue(null);

    const res = await GET(req("campaign=wave1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: "audience_view_missing", viewId: 5 });
    expect(db.company.findMany).not.toHaveBeenCalled();
    expect(db.company.count).not.toHaveBeenCalled();
  });

  it("audienceViewId resolves: audience narrows the where, response reports viewId/name/isArchived", async () => {
    db.campaign.findFirst.mockResolvedValue({
      id: 9, name: "Wave 1", slug: "wave1", senderUserId: null, currentWave: null,
      audienceViewId: 5, isArchived: true,
    });
    db.savedView.findFirst.mockResolvedValue({ id: 5, name: "Segment", filters: { pipeline_status: "1" } });
    (audienceWhere as ReturnType<typeof vi.fn>).mockResolvedValue({ county: "Pest" });

    const res = await GET(req("campaign=wave1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audience).toEqual({ viewId: 5, name: "Segment", isArchived: true });
    expect(db.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ AND: [{ county: "Pest" }] }) }),
    );
  });

  it("an audience may only narrow: a filter that would re-admit a non-callable status (KUKA) does not - CALLABLE_STATUSES stays ANDed on top of whatever the audience returns", async () => {
    db.campaign.findFirst.mockResolvedValue({
      id: 9, name: "Wave 1", slug: "wave1", senderUserId: null, currentWave: null,
      audienceViewId: 5, isArchived: false,
    });
    db.savedView.findFirst.mockResolvedValue({ id: 5, name: "Everyone incl. KUKA", filters: {} });
    // A saved view naming a non-callable pipeline_status is exactly the shape
    // that would re-admit a KUKA company if the audience clause replaced the
    // do-not-contact guard instead of being ANDed with it.
    (audienceWhere as ReturnType<typeof vi.fn>).mockResolvedValue({ pipelineStatus: "0" });

    await GET(req("campaign=wave1"));

    const where = db.company.findMany.mock.calls[0][0].where;
    expect(where.pipelineStatus).toEqual({ in: ["1", "2", "3", "5", "6"] });
    expect(where.AND).toEqual([{ pipelineStatus: "0" }]);
    // Prisma ANDs every top-level key together, so pipelineStatus (CALLABLE_STATUSES)
    // and AND[0].pipelineStatus ("0") both have to hold - a KUKA company can never
    // satisfy both, so the audience clause cannot re-admit it.
  });
});
