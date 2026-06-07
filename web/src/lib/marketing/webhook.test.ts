import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchApprovalWebhook, type WebhookContentPayload } from "./webhook";

const payload: WebhookContentPayload = {
  event: "content.approved",
  item: {
    id: 1, tenantId: 1, campaignId: null, channel: "linkedin_personal",
    contentType: "post", title: "T", body: "B", status: "approved",
    internal: false, scheduledFor: null, source: "content_factory",
    sourceMeta: null, externalUrl: null,
  },
  assets: [],
};

describe("dispatchApprovalWebhook", () => {
  const originalUrl = process.env.CONTENT_WEBHOOK_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    if (originalUrl === undefined) delete process.env.CONTENT_WEBHOOK_URL;
    else process.env.CONTENT_WEBHOOK_URL = originalUrl;
    vi.restoreAllMocks();
  });

  it("does nothing when CONTENT_WEBHOOK_URL is unset", async () => {
    delete process.env.CONTENT_WEBHOOK_URL;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await dispatchApprovalWebhook(payload);
    expect(res.attempted).toBe(false);
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns ok on a 2xx response", async () => {
    process.env.CONTENT_WEBHOOK_URL = "https://hook.example/test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const res = await dispatchApprovalWebhook(payload);
    expect(res).toMatchObject({ attempted: true, ok: true, status: 200 });
  });

  it("retries once then reports failure without throwing", async () => {
    process.env.CONTENT_WEBHOOK_URL = "https://hook.example/test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await dispatchApprovalWebhook(payload);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // initial + one retry
    expect(res.attempted).toBe(true);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("ECONNREFUSED");
  });

  it("treats a non-2xx as failure and retries", async () => {
    process.env.CONTENT_WEBHOOK_URL = "https://hook.example/test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 500 }));
    const res = await dispatchApprovalWebhook(payload);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("500");
  });
});
