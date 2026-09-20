import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { campaignBySlug, outreachDefaults, type CampaignRegistration } from "./registry";

vi.mock("@/lib/db", () => ({
  db: { campaign: { findFirst: vi.fn() } },
}));

type M = ReturnType<typeof vi.fn>;
const mockFindFirst = (db as unknown as { campaign: { findFirst: M } }).campaign.findFirst;

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
