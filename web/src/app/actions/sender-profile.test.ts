import { describe, it, expect, vi, beforeEach } from "vitest";

const getActor = vi.fn();
vi.mock("@/lib/actor", () => ({ getActor: (...a: unknown[]) => getActor(...a), NOT_A_CRM_USER: "nem CRM felhasználó" }));
const exec = vi.fn();
vi.mock("@/lib/db", () => ({ db: { $executeRaw: (...a: unknown[]) => exec(...a) } }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { saveSenderProfile } from "./sender-profile";

beforeEach(() => { getActor.mockReset(); exec.mockReset().mockResolvedValue(1); });

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
