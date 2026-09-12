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

/** Newest first. Undated items sink to the bottom, keeping their order. */
export function sortDossierItems(items: DossierItem[]): DossierItem[] {
  return [...items].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
}
