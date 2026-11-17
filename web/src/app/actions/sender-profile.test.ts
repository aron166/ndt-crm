import { describe, it, expect, vi, beforeEach } from "vitest";

const getActor = vi.fn();
vi.mock("@/lib/actor", () => ({ getActor: (...a: unknown[]) => getActor(...a), NOT_A_CRM_USER: "nem CRM felhasználó" }));
const exec = vi.fn();
const userFind = vi.hoisted(() => vi.fn());
const campaignFind = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { $executeRaw: (...a: unknown[]) => exec(...a), user: { findFirst: userFind }, campaign: { findFirst: campaignFind } } }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { saveSenderProfile, saveSenderPhone } from "./sender-profile";

// Users of tenant 1: 5 a member, 6 an admin, 9 a member who is a sender. Anyone else: not found.
const USERS: Record<number, { id: number; role: string; name: string; settings: unknown }> = {
  5: { id: 5, role: "member", name: "A B", settings: { phone: "+36 30 123 4567" } },
  6: { id: 6, role: "admin", name: "Admin", settings: null },
  9: { id: 9, role: "member", name: "Nagy Péter", settings: { theme: "dark" } },
};
beforeEach(() => {
  getActor.mockReset(); exec.mockReset().mockResolvedValue(1);
  userFind.mockReset().mockImplementation(async ({ where }: { where: { id: number; tenantId: number } }) => (where.tenantId === 1 ? USERS[where.id] ?? null : null));
  campaignFind.mockReset().mockResolvedValue(null);
});

describe("saveSenderProfile", () => {
  it("refuses a caller who is not a CRM user and writes nothing", async () => {
    getActor.mockResolvedValue({ userId: null, email: null });
    expect(await saveSenderProfile({ name: "A B", phone: "06301234567" })).toEqual({ error: "nem CRM felhasználó" });
    expect(exec).not.toHaveBeenCalled();
  });
  it("refuses a bad phone with a message and writes nothing", async () => {
    getActor.mockResolvedValue({ userId: 5, email: "a@b.hu" });
    expect(await saveSenderProfile({ name: "A B", phone: "123" })).toMatchObject({ error: expect.any(String) });
    expect(exec).not.toHaveBeenCalled();
  });
  it("writes the signed-in user's own row only, tenant scoped, phone normalised", async () => {
    getActor.mockResolvedValue({ userId: 5, email: "a@b.hu" });
    expect(await saveSenderProfile({ name: " Nagy Péter ", phone: "06301234567" })).toEqual({ ok: true });
    const sql = exec.mock.calls[0];
    expect(sql.slice(1)).toEqual(["Nagy Péter", JSON.stringify("+36 30 123 4567"), 5, 1]);
  });
  it("revalidates the profile page and the campaign hub after saving", async () => {
    getActor.mockResolvedValue({ userId: 5, email: "a@b.hu" });
    await saveSenderProfile({ name: "A B", phone: "06301234567" });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/profile");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns", "layout");
  });
  it("an empty phone removes the key instead of storing an empty string", async () => {
    getActor.mockResolvedValue({ userId: 5, email: "a@b.hu" });
    await saveSenderProfile({ name: "A B", phone: "" });
    expect(exec.mock.calls[0][0].join("?")).toContain("- 'phone'");
  });
});

describe("saveSenderPhone: the hub's phone field (AC3)", () => {
  it("refuses a caller who is not a CRM user and writes nothing", async () => {
    getActor.mockResolvedValue({ userId: null, email: null });
    expect(await saveSenderPhone({ userId: 9, phone: "06301234567" })).toEqual({ error: "nem CRM felhasználó" });
    expect(exec).not.toHaveBeenCalled();
  });
  it("the sender may set their own phone: normalised, own row, tenant scoped", async () => {
    getActor.mockResolvedValue({ userId: 9, email: "p@b.hu" });
    expect(await saveSenderPhone({ userId: 9, phone: "06 30 765 4321" })).toEqual({ ok: true, phone: "+36 30 765 4321" });
    expect(exec.mock.calls[0].slice(1)).toEqual([JSON.stringify("+36 30 765 4321"), 9, 1]);
  });
  it("a tenant admin may set another user's phone", async () => {
    getActor.mockResolvedValue({ userId: 6, email: "a@b.hu" });
    expect(await saveSenderPhone({ userId: 9, phone: "06301234567" })).toEqual({ ok: true, phone: "+36 30 123 4567" });
    expect(exec).toHaveBeenCalledTimes(1);
  });
  it("a plain member may not set someone else's phone", async () => {
    getActor.mockResolvedValue({ userId: 5, email: "a@b.hu" });
    expect(await saveSenderPhone({ userId: 9, phone: "06301234567" })).toMatchObject({ error: expect.any(String) });
    expect(exec).not.toHaveBeenCalled();
  });
  it("a user of another tenant (or no such user) is not found, even for an admin", async () => {
    getActor.mockResolvedValue({ userId: 6, email: "a@b.hu" });
    expect(await saveSenderPhone({ userId: 77, phone: "06301234567" })).toMatchObject({ error: expect.any(String) });
    expect(userFind.mock.calls.some((c) => c[0].where.id === 77 && c[0].where.tenantId === 1)).toBe(true);
    expect(exec).not.toHaveBeenCalled();
  });
  it("a bad phone is refused with a message and nothing is written", async () => {
    getActor.mockResolvedValue({ userId: 9, email: "p@b.hu" });
    expect(await saveSenderPhone({ userId: 9, phone: "123" })).toMatchObject({ error: expect.any(String) });
    expect(exec).not.toHaveBeenCalled();
  });
  it("an empty phone removes the key, the theme key survives", async () => {
    getActor.mockResolvedValue({ userId: 5, email: "a@b.hu" });
    expect(await saveSenderPhone({ userId: 5, phone: "" })).toEqual({ ok: true, phone: null });
    expect(exec.mock.calls[0][0].join("?")).toContain("- 'phone'");
  });
  it("revalidates the campaign hub", async () => {
    getActor.mockResolvedValue({ userId: 9, email: "p@b.hu" });
    await saveSenderPhone({ userId: 9, phone: "06301234567" });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns", "layout");
  });
});

describe("a sender's phone or name is part of what was approved (AC6)", () => {
  it("phone change refused while a campaign this user sends for is running or paused", async () => {
    getActor.mockResolvedValue({ userId: 9, email: "p@b.hu" });
    campaignFind.mockResolvedValue({ name: "Budapest indulás" });
    const r = await saveSenderPhone({ userId: 9, phone: "06301234567" });
    expect(r).toMatchObject({ error: expect.stringMatching(/piszkozat/) });
    expect(campaignFind.mock.calls[0][0].where).toMatchObject({ tenantId: 1, senderUserId: 9, status: { in: ["running", "paused"] } });
    expect(exec).not.toHaveBeenCalled();
  });
  it("saving the same phone again is not a change and is allowed", async () => {
    getActor.mockResolvedValue({ userId: 5, email: "a@b.hu" });
    campaignFind.mockResolvedValue({ name: "Fut" });
    expect(await saveSenderPhone({ userId: 5, phone: "+36 30 123 4567" })).toEqual({ ok: true, phone: "+36 30 123 4567" });
  });
  it("the profile page follows the same rule for a changed name or phone", async () => {
    getActor.mockResolvedValue({ userId: 5, email: "a@b.hu" });
    campaignFind.mockResolvedValue({ name: "Fut" });
    expect(await saveSenderProfile({ name: "Más Név", phone: "06301234567" })).toMatchObject({ error: expect.stringMatching(/piszkozat/) });
    expect(exec).not.toHaveBeenCalled();
    expect(await saveSenderProfile({ name: "A B", phone: "06301234567" })).toEqual({ ok: true });
  });
});

describe("Vanda #216 findings", () => {
  it("#216-1 a campaign approved between the check and the write: the write itself refuses, nothing slips past", async () => {
    getActor.mockResolvedValue({ userId: 9, email: "p@b.hu" });
    campaignFind.mockResolvedValueOnce(null).mockResolvedValue({ name: "Budapest indulás" });
    exec.mockResolvedValue(0); // the UPDATE's NOT EXISTS guard saw the running campaign
    const r = await saveSenderPhone({ userId: 9, phone: "06301234567" });
    expect(r).toMatchObject({ error: expect.stringMatching(/piszkozat/) });
    expect(exec.mock.calls[0][0].join("?")).toMatch(/NOT EXISTS[\s\S]*campaigns[\s\S]*running/);
  });
  it("#216-1 the profile page write carries the same guard", async () => {
    getActor.mockResolvedValue({ userId: 5, email: "a@b.hu" });
    campaignFind.mockResolvedValueOnce(null).mockResolvedValue({ name: "Fut" });
    exec.mockResolvedValue(0);
    expect(await saveSenderProfile({ name: "Más Név", phone: "" })).toMatchObject({ error: expect.stringMatching(/piszkozat/) });
    expect(exec.mock.calls[0][0].join("?")).toMatch(/NOT EXISTS[\s\S]*campaigns/);
  });
  it("#216-2 the lock message names a path that exists (an edit sends the campaign back to draft)", async () => {
    getActor.mockResolvedValue({ userId: 9, email: "p@b.hu" });
    campaignFind.mockResolvedValue({ name: "Budapest indulás" });
    const r = await saveSenderPhone({ userId: 9, phone: "06301234567" });
    expect(r.error).toMatch(/napi keret/);
    expect(r.error).not.toMatch(/Állítsa vissza/);
  });
  it("#216-3 malformed input is refused with a message, not thrown", async () => {
    getActor.mockResolvedValue({ userId: 6, email: "a@b.hu" });
    for (const bad of [{ userId: "x", phone: "1" }, { userId: Number.NaN, phone: "1" }, { userId: 9, phone: 5 }]) {
      expect(await saveSenderPhone(bad as unknown as { userId: number; phone: string })).toMatchObject({ error: expect.any(String) });
    }
    expect(userFind).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });
});
