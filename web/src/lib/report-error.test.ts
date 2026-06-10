import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reportError } from "./report-error";

describe("reportError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("always logs to console.error with scope and context", () => {
    reportError("test.scope", new Error("boom"), { ruleId: 7 });
    expect(console.error).toHaveBeenCalledWith(
      "[test.scope]",
      "boom",
      expect.objectContaining({ ruleId: 7, stack: expect.any(String) }),
    );
  });

  it("does not call the webhook when ERROR_WEBHOOK_URL is unset", () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "");
    reportError("test.scope", new Error("boom"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts Slack/Discord-compatible JSON to the webhook when configured", () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hooks.example.com/x");
    reportError("test.scope", new Error("boom"), { dealId: 3 });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://hooks.example.com/x");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.text).toContain("test.scope");
    expect(body.text).toContain("boom");
    expect(body.content).toBe(body.text);
    expect(body.error).toMatchObject({
      scope: "test.scope",
      message: "boom",
      context: { dealId: 3 },
    });
  });

  it("stringifies non-Error values", () => {
    reportError("test.scope", "plain failure");
    expect(console.error).toHaveBeenCalledWith(
      "[test.scope]",
      "plain failure",
      expect.objectContaining({ stack: undefined }),
    );
  });

  it("swallows webhook delivery failures instead of throwing", async () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hooks.example.com/x");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(() => reportError("test.scope", new Error("boom"))).not.toThrow();
    // Let the rejected promise's .catch handler run.
    await new Promise((r) => setTimeout(r, 0));
    expect(console.error).toHaveBeenCalledWith(
      "[report-error] webhook delivery failed:",
      expect.any(Error),
    );
  });
});
