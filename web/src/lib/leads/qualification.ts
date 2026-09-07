import { z } from "zod";

// Setter tab — the free-text qualification answers a setter fills in on the lead
// (Péter, BRIEFING addendum 2026-09-07 P0 #3). PURE module (no DB), shared by the
// UI, the server action and the public API. The DB reads live in queries.ts.
//
// Two halves, deliberately split:
//   • the QUESTION LIST is tenant config (tenants.settings.qualificationQuestions)
//     — editable at /leads/setup, so changing it never needs a migration;
//   • the ANSWERS are a flat { slug: text } JSON on the lead, so an answer
//     survives the question being re-worded and a removed question doesn't
//     destroy the history that was already captured.

export interface QualificationQuestion {
  /** Stable key stored in leads.qualification. Never re-generated for an existing question. */
  slug: string;
  label: string;
}

export const QUESTION_MAX = 10;
export const ANSWER_MAX = 2000;
export const LABEL_MAX = 200;

/**
 * ⚠️ PLACEHOLDERS. Áron + Péter deliver the real setter script Monday
 * (2026-09-08); these exist so the tab is usable and the shape is real, not so
 * anyone calls from them. Editable at /leads/setup — replacing them writes
 * `tenants.settings.qualificationQuestions` and this array stops being used.
 */
export const DEFAULT_QUALIFICATION_QUESTIONS: QualificationQuestion[] = [
  { slug: "project_type",   label: "TODO — Milyen szerkezetet kell vizsgálni? (födém, fal, híd, ipari padló)" },
  { slug: "area_m2",        label: "TODO — Mekkora a vizsgálandó felület (m²)?" },
  { slug: "deadline",       label: "TODO — Mikorra kell az eredmény?" },
  { slug: "decision_maker", label: "TODO — Ki dönt a megrendelésről, ő van most a vonalban?" },
  { slug: "prior_scanning", label: "TODO — Volt már náluk betonszkennelés? Mi volt az ára?" },
];

/** Slug for a freshly typed question. Same rules as slugifyStatusKey. */
export function slugifyQuestion(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 50) || "kerdes"
  );
}

const questionSchema = z.object({
  slug: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(LABEL_MAX),
});

/**
 * Read the tenant's question list out of an unvalidated settings blob. Anything
 * malformed falls back to the defaults rather than throwing — a bad settings row
 * must never take the lead page down.
 */
export function questionsFromSettings(settings: unknown): QualificationQuestion[] {
  const raw = (settings as { qualificationQuestions?: unknown } | null)?.qualificationQuestions;
  const parsed = z.array(questionSchema).min(1).max(QUESTION_MAX).safeParse(raw);
  if (!parsed.success) return DEFAULT_QUALIFICATION_QUESTIONS;
  // Duplicate slugs would silently overwrite each other's answers.
  const seen = new Set<string>();
  const unique = parsed.data.filter((q) => !seen.has(q.slug) && seen.add(q.slug));
  return unique.length > 0 ? unique : DEFAULT_QUALIFICATION_QUESTIONS;
}

/**
 * Parse the /leads/setup editor's textarea: one question per line, existing
 * slugs preserved by matching the previous list positionally is NOT safe, so we
 * take an explicit `slug|label` form and fall back to slugifying the label.
 * A line of `  ` is skipped; `#` starts a comment.
 */
export function parseQuestionLines(text: string): QualificationQuestion[] | { error: string } {
  const out: QualificationQuestion[] = [];
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const sep = t.indexOf("|");
    const label = (sep >= 0 ? t.slice(sep + 1) : t).trim();
    const slug = sep >= 0 ? slugifyQuestion(t.slice(0, sep)) : slugifyQuestion(label);
    if (!label) return { error: "Üres kérdésszöveg" };
    if (label.length > LABEL_MAX) return { error: `A kérdés túl hosszú (max ${LABEL_MAX} karakter)` };
    if (seen.has(slug)) return { error: `Két kérdés azonos azonosítót kapna: ${slug}` };
    seen.add(slug);
    out.push({ slug, label });
  }
  if (out.length === 0) return { error: "Legalább egy kérdés kell" };
  if (out.length > QUESTION_MAX) return { error: `Legfeljebb ${QUESTION_MAX} kérdés lehet` };
  return out;
}

/** Render a question list back into the editor's textarea form. */
export function questionsToLines(questions: QualificationQuestion[]): string {
  return questions.map((q) => `${q.slug}|${q.label}`).join("\n");
}

/**
 * Validate an answers patch. Only slugs the tenant currently asks about are
 * accepted; an empty answer deletes the key rather than storing "".
 */
export function parseAnswers(
  raw: unknown,
  questions: QualificationQuestion[],
): Record<string, string> | { error: string } {
  const shape = z.record(z.string().max(50), z.string().max(ANSWER_MAX));
  const parsed = shape.safeParse(raw);
  if (!parsed.success) return { error: `A válasz szöveges és legfeljebb ${ANSWER_MAX} karakter lehet` };
  const known = new Set(questions.map((q) => q.slug));
  const out: Record<string, string> = {};
  for (const [slug, value] of Object.entries(parsed.data)) {
    if (!known.has(slug)) return { error: `Ismeretlen kérdés: ${slug}` };
    const v = value.trim();
    if (v) out[slug] = v;
  }
  return out;
}

/** Stored answers, tolerating a null/garbage column. */
export function answersFrom(qualification: unknown): Record<string, string> {
  if (!qualification || typeof qualification !== "object" || Array.isArray(qualification)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(qualification as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
}
