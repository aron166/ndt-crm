import { describe, it, expect, vi, beforeEach } from "vitest";

const sendContentDigests = vi.fn();
vi.mock("@/lib/content/digest", () => ({ sendContentDigests: (...a: unknown[]) => sendContentDigests(...a) }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { GET } from "./route";

describe("GET /api/cron/content-digest", () => {
  beforeEach(() => {
    sendContentDigests.mockReset();
    vi.stubEnv("CRON_SECRET", "s3cret");
  });

  it("401s without the bearer secret", async () => {
    const res = await GET(new Request("https://x/api/cron/content-digest"));
    expect(res.status).toBe(401);
    expect(sendContentDigests).not.toHaveBeenCalled();
  });

  it("401s with the wrong secret", async () => {
    const res = await GET(new Request("https://x/api/cron/content-digest", { headers: { authorization: "Bearer wrong" } }));
    expect(res.status).toBe(401);
  });

  it("runs the digest with the right secret", async () => {
    sendContentDigests.mockResolvedValue({ sent: 2, skipped: 0 });
    const res = await GET(new Request("https://x/api/cron/content-digest", { headers: { authorization: "Bearer s3cret" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, sent: 2, skipped: 0 });
    expect(sendContentDigests).toHaveBeenCalledWith(1);
  });
});
