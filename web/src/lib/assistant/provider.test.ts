import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AssistantError, RATE_LIMITED, assistantConfig, chatCompletion, estimateCostUsd } from "./provider";

const cfg = { baseUrl: "https://x.test/v1", apiKey: "sk-secret", model: "m" };
const ok = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const good = { choices: [{ message: { content: "szia" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };

describe("assistantConfig", () => {
  it("is null without a key", () => {
    expect(assistantConfig({})).toBeNull();
    expect(assistantConfig({ ASSISTANT_API_KEY: "  " })).toBeNull();
  });
  it("applies defaults and strips the trailing slash", () => {
    expect(assistantConfig({ ASSISTANT_API_KEY: "k" })).toEqual({ baseUrl: "https://api.groq.com/openai/v1", apiKey: "k", model: "openai/gpt-oss-120b" });
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
  it("2xx with invalid JSON throws without usage", async () => {
    const e = await chatCompletion(cfg, [], { fetchImpl: vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })) }).catch((x) => x);
    expect(e).toBeInstanceOf(AssistantError);
    expect(e.usage).toBeUndefined();
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

describe("429 handling", () => {
  const limited = () => new Response("{}", { status: 429, headers: { "retry-after": "30" } });
  it("retries once after a 429, capped wait, then succeeds", async () => {
    const f = vi.fn().mockResolvedValueOnce(limited()).mockResolvedValueOnce(new Response(JSON.stringify(good)));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const r = await chatCompletion(cfg, [], { fetchImpl: f, sleep });
    expect(r.text).toBe("szia");
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10000);
  });
  it("two 429s give the Hungarian rate-limit error, no third try", async () => {
    const f = vi.fn().mockImplementation(async () => limited());
    const e = await chatCompletion(cfg, [], { fetchImpl: f, sleep: async () => {} }).catch((x) => x);
    expect(e).toBeInstanceOf(AssistantError);
    expect(e.status).toBe(429);
    expect(e.message).toBe(RATE_LIMITED);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("gpt-oss gets reasoning_effort low; a schema becomes a strict json_schema format", async () => {
    const f = ok(good);
    await chatCompletion({ ...cfg, model: "openai/gpt-oss-120b" }, [], { fetchImpl: f, schema: { name: "n", schema: { type: "object" } } });
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.reasoning_effort).toBe("low");
    expect(body.response_format).toEqual({ type: "json_schema", json_schema: { name: "n", schema: { type: "object" }, strict: true } });
  });
});

describe("estimateCostUsd", () => {
  it("uses defaults and env, ignores invalid env", () => {
    expect(estimateCostUsd(1_000_000, 1_000_000, {})).toBeCloseTo(0.75);
    expect(estimateCostUsd(1_000_000, 0, { ASSISTANT_PRICE_IN: "2" })).toBeCloseTo(2);
    expect(estimateCostUsd(1_000_000, 0, { ASSISTANT_PRICE_IN: "abc" })).toBeCloseTo(0.15);
  });
});
