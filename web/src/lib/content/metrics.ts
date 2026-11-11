// Hand-entered numbers on a published content item (ad and organic campaigns, until a connector exists).

export const METRIC_KEYS = ["impressions", "reactions", "comments", "clicks", "leads"] as const;
/** PROPOSAL copy. */
export const METRIC_LABEL: Record<string, string> = { impressions: "Megjelenés", reactions: "Reakció", comments: "Hozzászólás", clicks: "Kattintás", leads: "Lead" };
export type MetricKey = (typeof METRIC_KEYS)[number];
export type Metrics = Partial<Record<MetricKey, number>>;

/** Validate input from a form or the client: known keys, whole non-negative numbers, blanks dropped. */
export function parseMetrics(input: Record<string, unknown>): Metrics | { error: string } {
  const out: Metrics = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!(METRIC_KEYS as readonly string[]).includes(key)) return { error: `Ismeretlen mérőszám: ${key}` };
    const v = typeof raw === "string" ? raw.trim() : raw;
    if (v === "" || v == null) continue;
    const n = typeof v === "number" ? v : /^\d+$/.test(String(v)) ? Number(v) : NaN;
    if (!Number.isSafeInteger(n) || n < 0) return { error: "A számok nem negatív egészek" };
    out[key as MetricKey] = n;
  }
  return out;
}
