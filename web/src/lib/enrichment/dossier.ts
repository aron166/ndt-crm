import { z } from "zod";

/**
 * The dossier an external research skill writes onto a company or a person
 * (`enrichment` JSONB, via PATCH /api/companies/:id and /api/persons/:id).
 *
 * Deliberately small and flat: the CRM stores and renders it, it does not
 * reason about it. Everything is optional so a half-finished research run is
 * still storable, but the caps are hard — a runaway agent must not be able to
 * push megabytes of JSON into a row we render on a detail page.
 *
 * `apropo` is Péter's term: the three one-liners a caller opens the phone call
 * with. Exactly what the 4-touch cold-email schema's first touch needs too.
 */

export const dossierItemSchema = z.object({
  // Free text on purpose — a dossier line is often "2019" or "2023 tavasz",
  // not an ISO date. Sorting falls back to string compare, newest first.
  date: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(2000).optional(),
  source: z.string().trim().max(200).optional(),
  // http(s) only: `z.url()` alone happily accepts `javascript:alert(1)`, and this
  // text comes from an external research agent and ends up in an href.
  url: z
    .string()
    .trim()
    .url()
    .max(600)
    .refine((v) => /^https?:\/\//i.test(v), { message: "url must be http(s)" })
    .optional(),
});

export const dossierSchema = z
  .object({
    summary: z.string().trim().max(4000).optional(),
    /** the three apropó statements — max 3, extra ones are a 400 */
    apropo: z.array(z.string().trim().min(1).max(600)).max(3).optional(),
    /** chronological items, newest first once normalized */
    items: z.array(dossierItemSchema).max(200).optional(),
    /** what the research run looked at */
    sources: z.array(z.string().trim().min(1).max(600)).max(50).optional(),
    /** free-form extras the skill wants to keep; not rendered */
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type Dossier = z.infer<typeof dossierSchema>;
export type DossierItem = z.infer<typeof dossierItemSchema>;

/** Rows come back from Prisma as `Prisma.JsonValue`; render only what parses. */
export function readDossier(value: unknown): Dossier | null {
  if (!value || typeof value !== "object") return null;
  const parsed = dossierSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * A small digest of a dossier for the audit log, instead of the ~600 KB
 * document itself: `getEntityHistory` loads 100 audit rows into every detail
 * page's RSC payload, so storing the full before/after there does not scale.
 * `null` for "no dossier stored" (before a first PATCH, or after a clear).
 */
export function dossierDigest(value: unknown): { items: number; has_summary: boolean; apropo: number } | null {
  const dossier = readDossier(value);
  if (!dossier) return null;
  return {
    items: dossier.items?.length ?? 0,
    has_summary: !!dossier.summary,
    apropo: dossier.apropo?.length ?? 0,
  };
}

/** Only render a URL as a link when it actually parses as http/https — the
 * dossier is written by an external research agent, treat it as untrusted. */
export function safeHttpUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Newest first. Undated items sink to the bottom, keeping their order. */
export function sortDossierItems(items: DossierItem[]): DossierItem[] {
  return [...items].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
}
