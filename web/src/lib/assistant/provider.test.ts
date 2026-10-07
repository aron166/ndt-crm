import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AssistantError, assistantConfig, chatCompletion, estimateCostUsd } from "./provider";

const cfg = { baseUrl: "https://x.test/v1", apiKey: "sk-secret", model: "m" };
const ok = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const good = { choices: [{ message: { content: "szia" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };

describe("assistantConfig", () => {
  it("is null without a key", () => {
    expect(assistantConfig({})).toBeNull();
    expect(assistantConfig({ ASSISTANT_API_KEY: "  " })).toBeNull();
  });
  it("applies defaults and strips the trailing slash", () => {
    expect(assistantConfig({ ASSISTANT_API_KEY: "k" })).toEqual({ baseUrl: "https://api.x.ai/v1", apiKey: "k", model: "grok-4.3" });
    expect(assistantConfig({ ASSISTANT_API_KEY: "k", ASSISTANT_BASE_URL: "https://h/v1/", ASSISTANT_MODEL: "z" })).toMatchObject({ baseUrl: "https://h/v1", model: "z" });
  });
});

describe("chatCompletion", () => {
  it("sends the expected request and parses usage", async () => {
    const f = ok(good);
    const r = await chatCompletion(cfg, [{ role: "user", content: "hi" }], { fetchImpl: f });
    expect(r).toEqual({ text: "szia", promptTokens: 10, completionTokens: 5 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://x.test/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer sk-secret");
    expect(JSON.parse(init.body)).toEqual({ model: "m", messages: [{ role: "user", content: "hi" }], max_tokens: 800, temperature: 0.2 });
  });
  it("json mode adds response_format and honours maxTokens", async () => {
    const f = ok(good);
    await chatCompletion(cfg, [], { json: true, maxTokens: 700, fetchImpl: f });
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ response_format: { type: "json_object" }, max_tokens: 700 });
  });
  it("defaults usage to 0", async () => {
    const r = await chatCompletion(cfg, [], { fetchImpl: ok({ choices: [{ message: { content: "a" } }] }) });
    expect(r).toMatchObject({ promptTokens: 0, completionTokens: 0 });
  });
  it("non-2xx throws AssistantError without the key and with a short body", async () => {
    const f = vi.fn().mockResolvedValue(new Response("bad sk-secret " + "x".repeat(500), { status: 401 }));
    const e = await chatCompletion(cfg, [], { fetchImpl: f }).catch((x) => x);
    expect(e).toBeInstanceOf(AssistantError);
    expect(e.status).toBe(401);
    expect(e.message).not.toContain("sk-secret");
    expect(e.message.length).toBeLessThan(260);
  });
  it("missing content throws", async () => {
    await expect(chatCompletion(cfg, [], { fetchImpl: ok({ choices: [] }) })).rejects.toBeInstanceOf(AssistantError);
  });
});

describe("estimateCostUsd", () => {
  it("uses defaults and env, ignores invalid env", () => {
    expect(estimateCostUsd(1_000_000, 1_000_000, {})).toBeCloseTo(3.75);
    expect(estimateCostUsd(1_000_000, 0, { ASSISTANT_PRICE_IN: "2" })).toBeCloseTo(2);
    expect(estimateCostUsd(1_000_000, 0, { ASSISTANT_PRICE_IN: "abc" })).toBeCloseTo(1.25);
  });
});
