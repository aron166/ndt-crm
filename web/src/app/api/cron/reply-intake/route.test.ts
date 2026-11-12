// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  imapConfig: vi.fn(), fetchRecent: vi.fn(), run: vi.fn(), mark: vi.fn(), reportError: vi.fn(), resend: vi.fn(), processed: vi.fn(),
}));
vi.mock("@/lib/outreach/reply-intake/imap", () => ({ imapConfig: m.imapConfig, fetchRecent: m.fetchRecent }));
vi.mock("@/lib/outreach/reply-intake/run", () => ({ runReplyIntake: m.run, markInboxChecked: m.mark, processedImapIds: m.processed }));
vi.mock("@/lib/integrations/resend", () => ({ getResendConfig: m.resend }));
vi.mock("@/lib/report-error", () => ({ reportError: m.reportError }));

import { GET, POST } from "./route";

const req = (auth?: string) => new Request("http://x/api/cron/reply-intake", { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = "s3cret";
  m.imapConfig.mockReturnValue({ host: "h", port: 993, user: "box@ndt.hu", pass: "p" });
  m.resend.mockResolvedValue({ fromEmail: "aron@send.ndt.hu" });
  m.fetchRecent.mockResolvedValue({ messages: [Buffer.from("x")], complete: true });
  m.run.mockResolvedValue({ ok: true, seen: 0, new: 1, failed: 0 });
});
afterEach(() => { delete process.env.CRON_SECRET; });

describe("cron/reply-intake", () => {
  it("401 without or with a wrong bearer, and when CRON_SECRET is unset", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await POST(req("Bearer nope"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer undefined"))).status).toBe(401);
    expect(m.fetchRecent).not.toHaveBeenCalled();
  });

  it("IMAP not configured -> 200 configured:false, nothing fetched", async () => {
    m.imapConfig.mockReturnValue(null);
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, configured: false });
    expect(m.fetchRecent).not.toHaveBeenCalled();
    expect(m.mark).not.toHaveBeenCalled();
  });

  it("IMAP throws -> 502 and inboxCheckedAt untouched", async () => {
    m.fetchRecent.mockRejectedValue(new Error("auth"));
    const res = await POST(req("Bearer s3cret"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "IMAP" });
    expect(m.mark).not.toHaveBeenCalled();
    expect(m.reportError).toHaveBeenCalled();
  });

  it("success -> run with our domains, then markInboxChecked", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(m.run.mock.calls[0][0]).toBe(1);
    expect(m.mark).toHaveBeenCalledTimes(1);
    expect(m.mark.mock.calls[0][0]).toBe(1);
    expect((await (await GET(req("Bearer s3cret"))).json()).inboxChecked).toBe(true);
  });

  it("a message that failed -> 200, inboxChecked false, markInboxChecked not called (Vanda #203-1)", async () => {
    m.run.mockResolvedValue({ ok: true, seen: 0, new: 0, failed: 1 });
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ inboxChecked: false, failed: 1 });
    expect(m.mark).not.toHaveBeenCalled();
    expect(m.reportError).toHaveBeenCalled();
  });

  it("an incomplete fetch -> inboxChecked false, markInboxChecked not called (Vanda #203-1)", async () => {
    m.fetchRecent.mockResolvedValue({ messages: [], complete: false });
    const res = await GET(req("Bearer s3cret"));
    expect(await res.json()).toMatchObject({ inboxChecked: false });
    expect(m.mark).not.toHaveBeenCalled();
  });

  it("ourDomains: no free-mail domain, root domain added for a subdomain sender (Vanda #203-5)", async () => {
    m.imapConfig.mockReturnValue({ host: "h", port: 993, user: "box@gmail.com", pass: "p" });
    await GET(req("Bearer s3cret"));
    expect(m.run.mock.calls[0][3]).toEqual(["send.ndt.hu", "ndt.hu"]);
  });
});
