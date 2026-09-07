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

export const QUESTION_MAX = 15;
export const ANSWER_MAX = 2000;
export const LABEL_MAX = 200;
/**
 * Cap on how many answers one payload may carry. The locked model asks 11 and a
 * tenant may add its own, so this is generous — it exists only so that
 * `POST /api/leads`, which is public and takes an unbounded JSON body, cannot
 * persist megabytes into `leads.qualification` AND again into `app_events.payload`.
 * (Vanda, #81.)
 */
export const ANSWER_KEYS_MAX = 40;

/**
 * The wire shape of a qualification answer map. Deliberately open on the slug —
 * adding a question must never need a deploy — but bounded on every axis: key
 * length, value length, and now the number of keys. One definition, used by the
 * setter panel, the PATCH route and the public intake schema alike.
 */
export const answersRecordSchema = z
  .record(
    z.string().max(50, { message: "A kérdés azonosítója legfeljebb 50 karakter lehet" }),
    z.string().max(ANSWER_MAX, { message: `A válasz szöveges és legfeljebb ${ANSWER_MAX} karakter lehet` }),
  )
  .refine((o) => Object.keys(o).length <= ANSWER_KEYS_MAX, {
    message: `Legfeljebb ${ANSWER_KEYS_MAX} válasz küldhető`,
  });

/**
 * The locked qualification model (machines/birdsview/27_qualification_model.md,
 * 2026-09-07, Ãron Ã Kai). The `gate` question branches: A (`task`) asks the
 * seven, B (`curious`) asks the soft three and lands in the nurture pool.
 *
 * The SLUGS ARE PERMANENT â leads.qualification and computeTier() key off them.
 * The HU labels are the spec's draft wording, prefixed â ï¸ so it is obvious on
 * /leads/setup that Ãron still owes the final Hungarian. Editing the list there
 * writes tenants.settings.qualificationQuestions and this array stops being used
 * (answers survive, they are keyed by slug).
 */
export const DEFAULT_QUALIFICATION_QUESTIONS: QualificationQuestion[] = [
  // Gate â everyone.
  { slug: "gate", label: "⚠️ Van most egy konkrét feladat, amihez ez kellene, vagy egyelőre csak érdekel a technológia? (task / curious)" },
  // Branch A â `task`, the seven.
  { slug: "situation",  label: "⚠️ Milyen helyzetben kérdezel: cég/projekt · szakember (villanyszerelő, statikus, kivitelező) · saját ingatlan" },
  { slug: "concrete",   label: "⚠️ Mibe kellene belenézni: fal · födém/aljzat · híd/műtárgy · más / nem beton" },
  { slug: "goal",       label: "⚠️ Mit szeretnél tudni: mi van benne fúrás előtt · az állapotát · magát a technológiát értékelem" },
  { slug: "size",       label: "⚠️ Kb. mekkora felület vagy hány pont?" },
  { slug: "postcode",   label: "⚠️ Irányítószám (kötelező)" },
  { slug: "timing",     label: "⚠️ Mikor: ezen a héten · ebben a hónapban · nincs még dátum" },
  { slug: "own_device", label: "⚠️ Gondolkodtatok már saját műszeren? (igen / talán / nem)" },
  // Branch B â `curious`, the soft three.
  { slug: "hook",     label: "⚠️ Mi keltette fel az érdeklődésed?" },
  { slug: "use_case", label: "⚠️ Mire használnád, ha lenne ilyen a kezedben?" },
  { slug: "work",     label: "⚠️ Milyen munkát végzel / milyen cégnél?" },
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
  const parsed = answersRecordSchema.safeParse(raw);
  // Report what actually failed: mapping every schema error to the length
  // message told a 41-key payload it had a too-long answer. (Vanda, #84.)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? `A válasz szöveges és legfeljebb ${ANSWER_MAX} karakter lehet` };
  }
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

/**
 * Intake answers → stored answers. The landing form posts the gate as
 * `intent_path` (task|curious) because that is what the form's own branching
 * calls it; the CRM keys it `gate`. One name in the DB, both accepted on the
 * wire. Blank answers are dropped, unknown slugs are KEPT — losing a real answer
 * because a question was renamed is worse than an orphan key (the setter panel
 * only renders the current questions anyway).
 */
export function normalizeIntakeAnswers(raw: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    const value = typeof v === "string" ? v.trim() : "";
    if (!value) continue;
    out[k === "intent_path" ? "gate" : k] = value;
  }
  return out;
}
