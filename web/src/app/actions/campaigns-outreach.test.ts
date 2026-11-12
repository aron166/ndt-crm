import { describe, it, expect, vi, beforeEach } from "vitest";

const getActor = vi.fn();
vi.mock("@/lib/actor", () => ({ getActor: (...a: unknown[]) => getActor(...a), NOT_A_CRM_USER: "nem CRM felhasználó" }));
const db = vi.hoisted(() => ({ campaign: { findFirst: vi.fn(), update: vi.fn() }, user: { findFirst: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { setCampaignOutreach } from "./campaigns";

beforeEach(() => {
  for (const t of Object.values(db)) for (const f of Object.values(t)) f.mockReset();
  getActor.mockResolvedValue({ userId: 5, email: "a@b.hu" });
  db.user.findFirst.mockResolvedValue({ id: 9 });
  db.campaign.update.mockResolvedValue({});
});

describe("setCampaignOutreach: the sender is part of what was approved", () => {
  for (const status of ["running", "paused", "stopped", "done", "approved"]) {
    it(`refuses a sender change on a ${status} campaign`, async () => {
      db.campaign.findFirst.mockResolvedValue({ id: 1, status, senderUserId: 2, currentWave: null });
      const r = await setCampaignOutreach(1, { senderUserId: 9 });
      expect(r.error).toMatch(/piszkozat/);
      expect(db.campaign.update).not.toHaveBeenCalled();
    });
  }
  it("allows it on a draft", async () => {
    db.campaign.findFirst.mockResolvedValue({ id: 1, status: "draft", senderUserId: null, currentWave: null });
    expect(await setCampaignOutreach(1, { senderUserId: 9 })).toEqual({ success: true });
    expect(db.campaign.update).toHaveBeenCalled();
  });
  it("setting the same sender again, or changing only the wave, is not a sender change", async () => {
    db.campaign.findFirst.mockResolvedValue({ id: 1, status: "running", senderUserId: 9, currentWave: 1 });
    expect(await setCampaignOutreach(1, { senderUserId: 9, currentWave: 2 })).toEqual({ success: true });
    expect(await setCampaignOutreach(1, { currentWave: 3 })).toEqual({ success: true });
  });
});
