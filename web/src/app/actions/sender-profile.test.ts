import { describe, it, expect, vi, beforeEach } from "vitest";

const getActor = vi.fn();
vi.mock("@/lib/actor", () => ({ getActor: (...a: unknown[]) => getActor(...a), NOT_A_CRM_USER: "nem CRM felhasználó" }));
const exec = vi.fn();
const update = vi.fn();
vi.mock("@/lib/db", () => ({ db: { $executeRaw: (...a: unknown[]) => exec(...a), $transaction: async (f: (tx: unknown) => unknown) => f({ user: { update }, $executeRaw: exec }), user: { update, findFirst: vi.fn() } } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { saveSenderProfile } from "./sender-profile";

beforeEach(() => { getActor.mockReset(); exec.mockReset().mockResolvedValue(1); update.mockReset().mockResolvedValue({}); });

describe("saveSenderProfile", () => {
  it("refuses a caller who is not a CRM user and writes nothing", async () => {
    getActor.mockResolvedValue({ userId: null, email: null });
    expect(await saveSenderProfile({ name: "A B", phone: "06301234567" })).toEqual({ error: "nem CRM felhasználó" });
    expect(exec).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });
  it("refuses a bad phone with a message and writes nothing", async () => {
    getActor.mockResolvedValue({ userId: 5, email: "a@b.hu" });
    expect(await saveSenderProfile({ name: "A B", phone: "123" })).toMatchObject({ error: expect.any(String) });
    expect(exec).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });
  it("writes the signed-in user's own row only, tenant scoped, phone normalised", async () => {
    getActor.mockResolvedValue({ userId: 5, email: "a@b.hu" });
    expect(await saveSenderProfile({ name: " Nagy Péter ", phone: "06301234567" })).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ where: { id: 5, tenantId: 1 }, data: { name: "Nagy Péter" } });
    const sql = exec.mock.calls[0];
    expect(JSON.stringify(sql)).toContain("+36 30 123 4567");
    expect(sql).toContain(5); expect(sql).toContain(1);
  });
  it("an empty phone removes the key instead of storing an empty string", async () => {
    getActor.mockResolvedValue({ userId: 5, email: "a@b.hu" });
    await saveSenderProfile({ name: "A B", phone: "" });
    expect(String(exec.mock.calls[0][0].join("?"))).toContain("- 'phone'");
  });
});
