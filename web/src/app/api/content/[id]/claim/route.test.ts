import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/app-key-auth", () => ({
  validateAppKey: vi.fn(),
  rateLimit: vi.fn(() => true),
}));
vi.mock("@/lib/content/service", () => ({ claimItem: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { POST } from "./route";
import { validateAppKey } from "@/lib/app-key-auth";
import { claimItem } from "@/lib/content/service";

const KEY = { keyId: 1, tenantId: 7, appSlug: "content-revise" };

function req() {
  return new Request("http://x/api/content/5/claim", { method: "POST", headers: { authorization: "Bearer helm_x" } });
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/content/:id/claim", () => {
  it("401s without a valid key", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(req(), params("5"));
    expect(res.status).toBe(401);
  });

  it("400s on an invalid id", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    const res = await POST(req(), params("not-a-number"));
    expect(res.status).toBe(400);
    expect(claimItem).not.toHaveBeenCalled();
  });

  it("400s on a non-positive id", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    const res = await POST(req(), params("-1"));
    expect(res.status).toBe(400);
  });

  it("200s on a fresh claim", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (claimItem as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, alreadyClaimed: false });
    const res = await POST(req(), params("5"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyClaimed: false });
  });

  it("maps a service failure to its status", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (claimItem as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 409, error: "not claimable" });
    const res = await POST(req(), params("5"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("not claimable");
  });
});
