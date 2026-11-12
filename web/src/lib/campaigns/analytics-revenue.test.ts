import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  campaign: { findMany: vi.fn() }, campaignMember: { findMany: vi.fn() }, campaignEvent: { findMany: vi.fn() },
  lead: { findMany: vi.fn() }, deal: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
import { campaignAnalytics } from "./analytics";

beforeEach(() => {
  for (const t of Object.values(db)) for (const f of Object.values(t)) f.mockReset();
  db.campaign.findMany.mockResolvedValue([{ id: 1, slug: "bp", name: "BP", kind: "sequence", status: "running", dailyCap: 10 }]);
  db.campaignEvent.findMany.mockResolvedValue([]);
});

describe("campaignAnalytics revenue", () => {
  it("a lead shared by two members of one campaign is counted once", async () => {
    db.campaignMember.findMany.mockResolvedValue([
      { id: 1, campaignId: 1, state: "promoted", leadId: 100, segment: "gc" },
      { id: 2, campaignId: 1, state: "promoted", leadId: 100, segment: "gc" },
    ]);
    db.lead.findMany.mockResolvedValue([{ id: 100, status: "won", outcome: "won", channel: "cold_email", source: "web", convertedDealId: 9 }]);
    db.deal.findMany.mockResolvedValue([{ id: 9, value: { toString: () => "500000" }, currency: "HUF" }]);
    const [row] = await campaignAnalytics(1);
    expect(row.revenue.total).toMatchObject({ leads: 1, won: 1, wonValue: 500000, converted: 1 });
  });
  it("zero deals: no deal query, empty figures", async () => {
    db.campaignMember.findMany.mockResolvedValue([{ id: 1, campaignId: 1, state: "promoted", leadId: 100, segment: null }]);
    db.lead.findMany.mockResolvedValue([{ id: 100, status: "new", outcome: "open", channel: null, source: null, convertedDealId: null }]);
    const [row] = await campaignAnalytics(1);
    expect(db.deal.findMany).not.toHaveBeenCalled();
    expect(row.revenue.total).toMatchObject({ leads: 1, won: 0, converted: 0, wonValue: 0 });
  });
});
