import "server-only";
// OpenAI-compatible chat adapter (xAI Grok first, ADR/019). Text in, text out: the model is never given tools.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type AssistantConfig = { baseUrl: string; apiKey: string; model: string };
type Env = Record<string, string | undefined>;

export function assistantConfig(env: Env = process.env): AssistantConfig | null {
  const apiKey = env.ASSISTANT_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    baseUrl: (env.ASSISTANT_BASE_URL?.trim() || "https://api.x.ai/v1").replace(/\/+$/, ""),
    apiKey,
    model: env.ASSISTANT_MODEL?.trim() || "grok-4.3",
  };
}

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
  opts: { json?: boolean; maxTokens?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        max_tokens: opts.maxTokens ?? 800,
        temperature: 0.2,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AssistantError("Assistant request failed (network or timeout)");
  }
  const raw = await res.text();
  const scrub = (s: string) => s.split(cfg.apiKey).join("[redacted]").slice(0, 200);
  if (!res.ok) throw new AssistantError(`Assistant HTTP ${res.status}: ${scrub(raw)}`, res.status);
  let data: { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new AssistantError("Assistant returned invalid JSON", res.status, { promptTokens: 0, completionTokens: 0 });
  }
  const promptTokens = data?.usage?.prompt_tokens ?? 0;
  const completionTokens = data?.usage?.completion_tokens ?? 0;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text) throw new AssistantError("Assistant returned no content", res.status, { promptTokens, completionTokens });
  return { text, promptTokens, completionTokens };
}

const num = (v: string | undefined, d: number) => {
  const n = v === undefined || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

/** USD per 1M tokens; defaults are the grok-4.3 list price (docs.x.ai, 2026-10-07). */
export function estimateCostUsd(promptTokens: number, completionTokens: number, env: Env = process.env): number {
  const pin = num(env.ASSISTANT_PRICE_IN, 1.25);
  const pout = num(env.ASSISTANT_PRICE_OUT, 2.5);
  return (promptTokens * pin + completionTokens * pout) / 1_000_000;
}
