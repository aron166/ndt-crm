import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { tenant: { findUnique: vi.fn() }, $executeRaw: vi.fn().mockResolvedValue(1) } }));
import { db } from "@/lib/db";
import { setTenantSettings } from "./tenant-settings";

type M = ReturnType<typeof vi.fn>;
const d = db as unknown as { tenant: { findUnique: M }; $executeRaw: M };

beforeEach(() => {
  vi.clearAllMocks();
  d.tenant.findUnique.mockResolvedValue({ settings: { a: 1 } });
});

describe("setTenantSettings: one statement per patch", () => {
  it("a two-key patch is ONE update, so it lands whole or not at all", async () => {
    expect(await setTenantSettings(1, { x: "1", y: null })).toEqual({ x: null, y: null });
    expect(d.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = (d.$executeRaw.mock.calls[0][0] as string[]).join("?");
    expect(sql).toContain("||");
    expect(sql).toContain("jsonb_typeof");
    expect(JSON.parse(d.$executeRaw.mock.calls[0][1])).toEqual({ x: "1", y: null });
  });

  it("an undefined value is written as null, like before", async () => {
    await setTenantSettings(1, { x: undefined });
    expect(JSON.parse(d.$executeRaw.mock.calls[0][1])).toEqual({ x: null });
  });

  it("a value that cannot be serialized writes nothing", async () => {
    await expect(setTenantSettings(1, { x: "ok", y: BigInt(1) })).rejects.toThrow();
    expect(d.$executeRaw).not.toHaveBeenCalled();
  });

  it("settings JSON null (or SQL NULL) reads as empty for the before values", async () => {
    d.tenant.findUnique.mockResolvedValue({ settings: null });
    expect(await setTenantSettings(1, { x: 2 })).toEqual({ x: null });
  });

  it("an empty patch writes nothing", async () => {
    expect(await setTenantSettings(1, {})).toEqual({});
    expect(d.$executeRaw).not.toHaveBeenCalled();
  });
});
