import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/app-key-auth", () => ({
  validateAppKey: vi.fn(),
  rateLimit: vi.fn(() => true),
}));
vi.mock("@/lib/content/service", () => ({ getLive: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { GET } from "./route";
import { validateAppKey } from "@/lib/app-key-auth";
import { getLive } from "@/lib/content/service";

const KEY = { keyId: 1, tenantId: 7, appSlug: "outreach" };

function req(qs = "") {
  return new Request(`http://x/api/content/live${qs}`, { headers: { authorization: "Bearer helm_x" } });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/content/live", () => {
  it("401s without a valid key", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("passes filters through and returns items", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (getLive as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }]);
    const res = await GET(req("?category=email&campaign=q3&format=pdf"));
    expect(res.status).toBe(200);
    expect(getLive).toHaveBeenCalledWith(7, { category: "email", campaignSlug: "q3", format: "pdf" });
  });
});
