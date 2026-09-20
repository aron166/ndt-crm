import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { audienceWhere } from "@/lib/marketing/audience-query";
import { campaignBySlug, campaignsBySlugs, resolveAudience, outreachDefaults, type CampaignRegistration } from "./registry";

vi.mock("@/lib/db", () => ({
  db: {
    campaign: { findFirst: vi.fn(), findMany: vi.fn() },
    savedView: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/marketing/audience-query", () => ({ audienceWhere: vi.fn() }));

type M = ReturnType<typeof vi.fn>;
const mockFindFirst = (db as unknown as { campaign: { findFirst: M } }).campaign.findFirst;
const mockFindMany = (db as unknown as { campaign: { findMany: M } }).campaign.findMany;
const mockSavedViewFindFirst = (db as unknown as { savedView: { findFirst: M } }).savedView.findFirst;
const mockAudienceWhere = audienceWhere as unknown as M;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("campaignBySlug", () => {
  it("returns the row scoped to tenant + slug", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1, name: "Campaign", slug: "c1", senderUserId: 2, currentWave: 3,
      audienceViewId: null, isArchived: false,
    });
    const res = await campaignBySlug(7, "c1");
    expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 7, slug: "c1" } }));
    expect(res).toMatchObject({ id: 1, slug: "c1" });
  });

  it("returns null for an unregistered key - legacy free-string behaviour", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await campaignBySlug(7, "TESZT");
    expect(res).toBeNull();
  });
});

describe("outreachDefaults", () => {
  const REG: CampaignRegistration = {
    id: 1, name: "Campaign", slug: "c1", senderUserId: 9, currentWave: 4,
    audienceViewId: null, isArchived: false,
  };

  it("payload-stated values win over the registration", () => {
    expect(outreachDefaults(REG, { senderUserId: 1, wave: 2 })).toEqual({ senderUserId: 1, wave: 2 });
  });

  it("explicit null in the payload stays null - never falls back", () => {
    expect(outreachDefaults(REG, { senderUserId: null, wave: null })).toEqual({ senderUserId: null, wave: null });
  });

  it("undefined falls back to the registration's sender/wave", () => {
    expect(outreachDefaults(REG, {})).toEqual({ senderUserId: 9, wave: 4 });
  });

  it("no registration means no fallback", () => {
    expect(outreachDefaults(null, {})).toEqual({});
  });

  it("registered but sender/wave themselves null: no fallback for that field", () => {
    const reg = { ...REG, senderUserId: null, currentWave: null };
    expect(outreachDefaults(reg, {})).toEqual({});
  });
});

describe("campaignsBySlugs", () => {
  it("maps found slugs to their row and omits absent ones", async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, name: "Wave 1", slug: "wave1", senderUserId: 3, currentWave: 2, audienceViewId: null, isArchived: false },
    ]);
    const res = await campaignsBySlugs(7, ["wave1", "wave2"]);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 7, slug: { in: ["wave1", "wave2"] } },
    }));
    expect(res.get("wave1")).toMatchObject({ id: 1, slug: "wave1" });
    expect(res.has("wave2")).toBe(false);
  });

  it("no slugs means no query and an empty map", async () => {
    const res = await campaignsBySlugs(7, []);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(res.size).toBe(0);
  });
});

describe("resolveAudience", () => {
  const REG_NO_AUDIENCE: CampaignRegistration = {
    id: 1, name: "Campaign", slug: "c1", senderUserId: null, currentWave: null,
    audienceViewId: null, isArchived: false,
  };
  const REG_WITH_AUDIENCE: CampaignRegistration = {
    id: 1, name: "Campaign", slug: "c1", senderUserId: null, currentWave: null,
    audienceViewId: 5, isArchived: true,
  };

  it("no campaign row: kind none", async () => {
    expect(await resolveAudience(7, null)).toEqual({ kind: "none" });
    expect(mockSavedViewFindFirst).not.toHaveBeenCalled();
  });

  it("campaign row with no audience view set: kind none", async () => {
    expect(await resolveAudience(7, REG_NO_AUDIENCE)).toEqual({ kind: "none" });
    expect(mockSavedViewFindFirst).not.toHaveBeenCalled();
  });

  it("audience view id set but the saved view row is gone: kind missing, carries the viewId", async () => {
    mockSavedViewFindFirst.mockResolvedValue(null);
    expect(await resolveAudience(7, REG_WITH_AUDIENCE)).toEqual({ kind: "missing", viewId: 5 });
  });

  it("audience view resolves: kind ok, carries the campaign's isArchived and the resolved where", async () => {
    mockSavedViewFindFirst.mockResolvedValue({ id: 5, name: "Segment", filters: { pipeline_status: "1" } });
    mockAudienceWhere.mockResolvedValue({ pipelineStatus: "1" });

    const res = await resolveAudience(7, REG_WITH_AUDIENCE);

    expect(mockAudienceWhere).toHaveBeenCalledWith({ pipeline_status: "1" }, 7);
    expect(res).toEqual({
      kind: "ok", viewId: 5, name: "Segment", isArchived: true, where: { pipelineStatus: "1" },
    });
  });
});
