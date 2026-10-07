import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AssistantError, RATE_LIMITED, assistantConfig, chatCompletion, chatCompletionStream, estimateCostUsd, retryDelayMs } from "./provider";

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
  const limited = () => new Response("{}", { status: 429, headers: { "retry-after": "3" } });
  it("retry-after past the cap fails at once, no wait, no retry", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "30" } })).mockResolvedValueOnce(new Response(JSON.stringify(good)));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const e = await chatCompletion(cfg, [], { fetchImpl: f, sleep }).catch((x) => x);
    expect(e.message).toBe(RATE_LIMITED);
    expect(f).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    const g = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "5" } })).mockResolvedValueOnce(new Response(JSON.stringify(good)));
    const onWait = vi.fn();
    expect((await chatCompletion(cfg, [], { fetchImpl: g, sleep, onWait })).text).toBe("szia");
    expect(onWait).toHaveBeenCalledWith(5250);
  });
  it("waits for retry-after, else Groq's reset-tokens header, else 2 s", () => {
    expect(retryDelayMs(new Headers({ "retry-after": "7" }))).toBe(7250);
    expect(retryDelayMs(new Headers({ "retry-after": "120" }))).toBeNull();
    expect(retryDelayMs(new Headers({ "x-ratelimit-reset-tokens": "7.66s" }))).toBe(7910);
    expect(retryDelayMs(new Headers({ "x-ratelimit-reset-tokens": "1m2.5s" }))).toBeNull();
    expect(retryDelayMs(new Headers({ "x-ratelimit-reset-tokens": "450ms" }))).toBe(700);
    expect(retryDelayMs(new Headers())).toBe(2000);
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

describe("chatCompletionStream", () => {
  const enc = new TextEncoder();
  const sse = (chunks: string[]) => new Response(new ReadableStream({
    start(c) { chunks.forEach((x) => c.enqueue(enc.encode(x))); c.close(); },
  }), { status: 200 });
  const delta = (s: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: s } }] })}\n\n`;
  const usage = `data: ${JSON.stringify({ choices: [], x_groq: { usage: { prompt_tokens: 7, completion_tokens: 3 } } })}\n\ndata: [DONE]\n\n`;
  const all = delta("Sz") + delta("ia") + usage;
  const split = (s: string, at: number) => [s.slice(0, at), s.slice(at)];

  it("accumulates across mid-line splits and reads usage", async () => {
    const f = vi.fn().mockResolvedValue(sse(split(all, 25)));
    const seen: string[] = [];
    const r = await chatCompletionStream(cfg, [{ role: "user", content: "hi" }], { fetchImpl: f, onText: (t) => { seen.push(t); } });
    expect(r).toEqual({ text: "Szia", promptTokens: 7, completionTokens: 3, stopped: false, streamed: true });
    expect(seen).toEqual(["Sz", "Szia"]);
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });
  it("stop aborts and estimates usage", async () => {
    const f = vi.fn().mockResolvedValue(sse([delta("abcdef"), delta("ghi"), usage]));
    const r = await chatCompletionStream(cfg, [{ role: "user", content: "x".repeat(30) }], { fetchImpl: f, onText: () => "stop" });
    expect(r).toMatchObject({ text: "abcdef", stopped: true, streamed: true, promptTokens: 10, completionTokens: 2 });
    expect(f.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("retries once on 429", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "2" } })).mockResolvedValueOnce(sse([all]));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const r = await chatCompletionStream(cfg, [], { fetchImpl: f, sleep, onText: () => {} });
    expect(r.text).toBe("Szia");
    expect(sleep).toHaveBeenCalledWith(2250);
    const e = await chatCompletionStream(cfg, [], { fetchImpl: vi.fn().mockImplementation(async () => new Response("{}", { status: 429 })), sleep, onText: () => {} }).catch((x) => x);
    expect(e.message).toBe(RATE_LIMITED);
  });
  it("400 falls back to one-shot and feeds growing prefixes", async () => {
    const long = "a".repeat(50);
    const f = vi.fn()
      .mockResolvedValueOnce(new Response("no stream with schema", { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: long } }], usage: { prompt_tokens: 4, completion_tokens: 6 } })));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const seen: number[] = [];
    const r = await chatCompletionStream(cfg, [], { fetchImpl: f, sleep, schema: { name: "n", schema: {} }, maxTokens: 500, onText: (t) => { seen.push(t.length); } });
    expect(r).toMatchObject({ text: long, promptTokens: 4, completionTokens: 6, stopped: false, streamed: false });
    expect(seen).toEqual([24, 48, 50]);
    expect(sleep).toHaveBeenCalledWith(12);
    const body = JSON.parse(f.mock.calls[1][1].body);
    expect(body.stream).toBeUndefined();
    expect(body).toMatchObject({ max_tokens: 500, response_format: { type: "json_schema" } });
  });
});
