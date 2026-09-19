import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/app-key-auth", () => ({
  validateAppKey: vi.fn(),
  rateLimit: vi.fn(() => true),
}));
vi.mock("@/lib/content/service", () => ({ getQueue: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { GET } from "./route";
import { validateAppKey } from "@/lib/app-key-auth";
import { getQueue } from "@/lib/content/service";

const KEY = { keyId: 1, tenantId: 7, appSlug: "content-revise" };

function req(qs = "") {
  return new Request(`http://x/api/content/queue${qs}`, { headers: { authorization: "Bearer helm_x" } });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/content/queue", () => {
  it("401s without a valid key", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("rejects an unknown status with 400", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    const res = await GET(req("?status=bogus"));
    expect(res.status).toBe(400);
  });

  it("defaults to changes_requested,rewrite_requested and returns items", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (getQueue as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(getQueue).toHaveBeenCalledWith(7, ["changes_requested", "rewrite_requested"], { category: undefined });
    expect((await res.json()).items).toEqual([{ id: 1 }]);
  });

  it("rejects an unknown category with 400", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    const res = await GET(req("?category=bogus"));
    expect(res.status).toBe(400);
  });

  it("rejects an empty ?category= with 400 instead of silently returning every category", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    const res = await GET(req("?category="));
    expect(res.status).toBe(400);
    expect(getQueue).not.toHaveBeenCalled();
  });

  it("passes a valid category through to getQueue (agent read-back of a decision)", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (getQueue as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 2 }]);
    const res = await GET(req("?status=in_review&category=decision"));
    expect(res.status).toBe(200);
    expect(getQueue).toHaveBeenCalledWith(7, ["in_review"], { category: "decision" });
    expect((await res.json()).items).toEqual([{ id: 2 }]);
  });
});
