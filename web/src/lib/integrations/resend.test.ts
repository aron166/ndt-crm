import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendEmail } from "./resend";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/enrichment/recompute", () => ({ recomputeCloseness: vi.fn() }));
vi.mock("@/lib/suppression", () => ({ isAddressSuppressed: vi.fn().mockResolvedValue(false), SUPPRESSED_ERROR: "x" }));
vi.mock("@/lib/db", () => ({
  db: { integrationCredential: { findUnique: vi.fn().mockResolvedValue({ isActive: true, credentials: { apiKey: "k", fromEmail: "f@x.hu" } }) } },
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ id: "re_1" }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const base = { tenantId: 1, to: "a@b.hu", subject: "S", text: "T", skipLog: true };

describe("sendEmail headers", () => {
  it("forwards headers in the body and the idempotency key as an HTTP header", async () => {
    await sendEmail({ ...base, headers: { "List-Unsubscribe": "<https://u>" }, idempotencyKey: "draft-1" });
    const init = fetchMock.mock.calls[0][1];
    expect(JSON.parse(init.body).headers).toEqual({ "List-Unsubscribe": "<https://u>" });
    expect(init.headers["Idempotency-Key"]).toBe("draft-1");
  });
  it("omits both when not given", async () => {
    await sendEmail(base);
    const init = fetchMock.mock.calls[0][1];
    expect(JSON.parse(init.body)).not.toHaveProperty("headers");
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
  });
});
