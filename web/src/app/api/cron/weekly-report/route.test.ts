import { describe, it, expect, vi, beforeEach } from "vitest";

const sendWeeklyReports = vi.fn();
vi.mock("@/lib/reports/weekly-email", () => ({ sendWeeklyReports: (...a: unknown[]) => sendWeeklyReports(...a) }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { GET } from "./route";

describe("GET /api/cron/weekly-report", () => {
  beforeEach(() => {
    sendWeeklyReports.mockReset();
    vi.stubEnv("CRON_SECRET", "s3cret");
  });

  it("401s without the bearer secret", async () => {
    const res = await GET(new Request("https://x/api/cron/weekly-report"));
    expect(res.status).toBe(401);
    expect(sendWeeklyReports).not.toHaveBeenCalled();
  });

  it("401s with the wrong secret", async () => {
    const res = await GET(new Request("https://x/api/cron/weekly-report", { headers: { authorization: "Bearer wrong" } }));
    expect(res.status).toBe(401);
  });

  it("runs the weekly report with the right secret", async () => {
    sendWeeklyReports.mockResolvedValue({ sent: 2, skipped: 0 });
    const res = await GET(new Request("https://x/api/cron/weekly-report", { headers: { authorization: "Bearer s3cret" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, sent: 2, skipped: 0 });
    expect(sendWeeklyReports).toHaveBeenCalledWith(1);
  });
});
