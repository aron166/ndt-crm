import "server-only";
// OpenAI-compatible chat adapter (Groq first, ADR/019). Text in, text out: the model is never given tools.
// Default model openai/gpt-oss-120b: the strongest general model on the Groq free tier
// (console.groq.com/docs/models, /docs/rate-limits, 2026-10-07: 30 RPM, 1K RPD, 8K TPM, 200K TPD).

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type AssistantConfig = { baseUrl: string; apiKey: string; model: string };
type Env = Record<string, string | undefined>;

export function assistantConfig(env: Env = process.env): AssistantConfig | null {
  const apiKey = env.ASSISTANT_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    baseUrl: (env.ASSISTANT_BASE_URL?.trim() || "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
    apiKey,
    model: env.ASSISTANT_MODEL?.trim() || "openai/gpt-oss-120b",
  };
}

/** Shown when the provider answers 429 twice (free-tier rate limit). PROPOSAL copy. */
export const RATE_LIMITED = "Pillanat, túl sok kérés. Kérem, próbálja újra egy perc múlva.";
const RETRY_CAP_MS = 10_000;

export class AssistantError extends Error {
  status?: number;
  /** Set when the provider answered 2xx (so tokens may have been billed) but the reply was unusable. */
  usage?: { promptTokens: number; completionTokens: number };
  constructor(message: string, status?: number, usage?: { promptTokens: number; completionTokens: number }) {
    super(message);
    this.name = "AssistantError";
    this.status = status;
    this.usage = usage;
  }
}

export async function chatCompletion(
  cfg: AssistantConfig,
  messages: ChatMessage[],
  opts: {
    json?: boolean;
    /** Strict JSON schema (OpenAI-compatible `json_schema` response format). Implies json. */
    schema?: { name: string; schema: Record<string, unknown> };
    maxTokens?: number;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const f = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const responseFormat = opts.schema
    ? { response_format: { type: "json_schema", json_schema: { name: opts.schema.name, schema: opts.schema.schema, strict: true } } }
    : opts.json ? { response_format: { type: "json_object" } } : {};
  // gpt-oss is a reasoning model: reasoning tokens count against max_tokens, so keep it low.
  const reasoning = cfg.model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {};
  const send = () => f(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: opts.maxTokens ?? 800,
      temperature: 0.2,
      ...reasoning,
      ...responseFormat,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  let res: Response;
  try {
    res = await send();
    // Free tier: one retry after retry-after (capped), then give up with RATE_LIMITED.
    if (res.status === 429) {
      const after = Number(res.headers.get("retry-after"));
      await sleep(Math.min(RETRY_CAP_MS, Number.isFinite(after) && after > 0 ? after * 1000 : 1000));
      res = await send();
    }
  } catch {
    throw new AssistantError("Assistant request failed (network or timeout)");
  }
  if (res.status === 429) throw new AssistantError(RATE_LIMITED, 429);
  const raw = await res.text();
  const scrub = (s: string) => s.split(cfg.apiKey).join("[redacted]").slice(0, 200);
  if (!res.ok) throw new AssistantError(`Assistant HTTP ${res.status}: ${scrub(raw)}`, res.status);
  let data: { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new AssistantError("Assistant returned invalid JSON", res.status);
  }
  const promptTokens = data?.usage?.prompt_tokens ?? 0;
  const completionTokens = data?.usage?.completion_tokens ?? 0;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text) throw new AssistantError("Assistant returned no content", res.status, { promptTokens, completionTokens });
  return { text, promptTokens, completionTokens };
}

type Usage = { prompt_tokens?: number; completion_tokens?: number };

export async function chatCompletionStream(
  cfg: AssistantConfig,
  messages: ChatMessage[],
  opts: {
    schema?: { name: string; schema: Record<string, unknown> };
    maxTokens?: number;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    onText: (soFar: string) => void | "stop";
    /** Checks the finished streamed text; false triggers the strict one-shot fallback. */
    accept?: (text: string) => boolean;
  },
): Promise<{ text: string; promptTokens: number; completionTokens: number; stopped: boolean; streamed: boolean }> {
  const f = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const ctrl = new AbortController();
  // Groq: "Streaming and tool use are not currently supported with Structured Outputs"
  // (console.groq.com/docs/structured-outputs, 2026-10-07). So the stream carries no
  // response_format (the prompt asks for the JSON shape) and the strict schema is the
  // fallback: a one-shot call when the streamed text fails `accept` or the stream is refused.
  const reasoning = cfg.model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {};
  const send = () => f(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: opts.maxTokens ?? 800,
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true },
      ...reasoning,
    }),
    signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(60_000)]),
  });
  const scrub = (t: string) => t.split(cfg.apiKey).join("[redacted]").slice(0, 200);
  let res: Response;
  try {
    res = await send();
    if (res.status === 429) {
      const after = Number(res.headers.get("retry-after"));
      await sleep(Math.min(RETRY_CAP_MS, Number.isFinite(after) && after > 0 ? after * 1000 : 1000));
      res = await send();
    }
  } catch {
    throw new AssistantError("Assistant request failed (network or timeout)");
  }
  if (res.status === 429) throw new AssistantError(RATE_LIMITED, 429);
  const oneShot = async (spent: { promptTokens: number; completionTokens: number }) => {
    let r;
    try {
      r = await chatCompletion(cfg, messages, { schema: opts.schema, maxTokens: opts.maxTokens, fetchImpl: f, sleep });
    } catch (e) {
      // The streamed attempt was billed: carry its usage so the caller logs it against the cap.
      if (e instanceof AssistantError && (spent.promptTokens || spent.completionTokens)) {
        e.usage = { promptTokens: spent.promptTokens + (e.usage?.promptTokens ?? 0), completionTokens: spent.completionTokens + (e.usage?.completionTokens ?? 0) };
      }
      throw e;
    }
    let stopped = false;
    for (let n = 24; !stopped; n += 24) {
      if (opts.onText(r.text.slice(0, n)) === "stop") stopped = true;
      if (n >= r.text.length) break;
      await sleep(12);
    }
    return { ...r, promptTokens: r.promptTokens + spent.promptTokens, completionTokens: r.completionTokens + spent.completionTokens, stopped, streamed: false };
  };
  if (res.status >= 400 && res.status < 500) return oneShot({ promptTokens: 0, completionTokens: 0 });
  if (!res.ok || !res.body) throw new AssistantError(`Assistant HTTP ${res.status}: ${scrub(await res.text().catch(() => ""))}`, res.status);

  let text = "";
  let usage: Usage | undefined;
  let stopped = false;
  const handle = (line: string): boolean => {
    if (!line.startsWith("data:")) return false;
    const d = line.slice(5).trim();
    if (!d || d === "[DONE]") return false;
    let j: { choices?: { delta?: { content?: unknown } }[]; usage?: Usage; x_groq?: { usage?: Usage } };
    try { j = JSON.parse(d); } catch { return false; }
    usage = j.usage ?? j.x_groq?.usage ?? usage;
    const c = j.choices?.[0]?.delta?.content;
    if (typeof c === "string" && c) {
      text += c;
      if (opts.onText(text) === "stop") return true;
    }
    return false;
  };
  try {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    read: for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (handle(line)) { stopped = true; break read; }
      }
    }
    if (!stopped && buf.trim() && handle(buf.trim())) stopped = true;
    if (stopped) { ctrl.abort(); reader.cancel().catch(() => {}); }
  } catch {
    if (!stopped) throw new AssistantError("Assistant stream failed", res.status);
  }
  const est = (chars: number) => Math.ceil(chars / 3);
  const promptTokens = usage?.prompt_tokens ?? est(messages.reduce((n, m) => n + m.content.length, 0));
  const completionTokens = usage?.completion_tokens ?? est(text.length);
  if (!stopped && opts.schema && opts.accept && !opts.accept(text)) return oneShot({ promptTokens, completionTokens });
  if (!text) throw new AssistantError("Assistant returned no content", res.status, { promptTokens, completionTokens });
  return { text, promptTokens, completionTokens, stopped, streamed: true };
}

const num = (v: string | undefined, d: number) => {
  const n = v === undefined || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

/**
 * USD per 1M tokens; defaults are the Groq openai/gpt-oss-120b list price
 * (console.groq.com/docs/models, 2026-10-07: $0.15 in / $0.60 out). The free tier
 * bills nothing, so this is the cost if the key is on a paid plan.
 */
export function estimateCostUsd(promptTokens: number, completionTokens: number, env: Env = process.env): number {
  const pin = num(env.ASSISTANT_PRICE_IN, 0.15);
  const pout = num(env.ASSISTANT_PRICE_OUT, 0.6);
  return (promptTokens * pin + completionTokens * pout) / 1_000_000;
}
