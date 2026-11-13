import { describe, it, expect, vi, beforeEach } from "vitest";

const run = vi.fn();
vi.mock("@/lib/campaigns/scheduled-send", () => ({ runScheduledSends: (...a: unknown[]) => run(...a) }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { GET, POST } from "./route";

const req = (auth?: string) => new Request("https://x/api/cron/campaign-send", { headers: auth ? { authorization: auth } : {} });

describe("/api/cron/campaign-send", () => {
  beforeEach(() => {
    run.mockReset();
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("SCHEDULED_SENDING", "on");
  });

  it("401s without the bearer, with a wrong one, and when CRON_SECRET is unset", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await POST(req("Bearer wrong"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("does nothing while SCHEDULED_SENDING is not on", async () => {
    vi.stubEnv("SCHEDULED_SENDING", "");
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, disabled: true });
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the sender when on, for GET and POST", async () => {
    run.mockResolvedValue({ ok: true, campaigns: [] });
    for (const h of [GET, POST]) {
      const res = await h(req("Bearer s3cret"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, campaigns: [] });
    }
    expect(run).toHaveBeenCalledTimes(2);
  });
});
