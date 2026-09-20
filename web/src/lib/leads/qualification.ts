import { z } from "zod";

// The tenant's question model, and the per-lead answers keyed by it.
//
// PURE module (no DB), shared by the UI, the server action and the public API.
// The DB reads live in queries.ts.
//
// Three halves, deliberately split:
//   • the QUESTION LIST is tenant config (tenants.settings.qualificationQuestions)
//     — editable at /leads/setup, so changing it never needs a migration;
//   • the EFFECTIVE ANSWERS are a flat { slug: text } JSON on the lead
//     (`leads.qualification`) — every statistic and computeTier() read THIS and
//     nothing else, unchanged since the model was locked;
//   • the PROVENANCE is a parallel JSON (`leads.answer_sources`) holding, per
//     slug, what the FORM said and what the SETTER said, each with its time.
//     The effective map is derived from it: setter wins, form is never erased.
//
// Slugs are permanent and never re-used: re-wording a question must not start a
// new statistics bucket (2026-09-07 lock, machines/birdsview/27_qualification_model.md).

/** Answer types a question can ask for. `text` is the default and the fallback. */
export const ANSWER_TYPES = ["choice", "text", "number", "postcode", "contact"] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

/** Which gate branch a question belongs to. Absent = asked in both. */
export const BRANCHES = ["task", "curious"] as const;
export type Branch = (typeof BRANCHES)[number];

/** Who the question is for. Absent = asked of both. */
export const AUDIENCES = ["company", "private"] as const;
export type Audience = (typeof AUDIENCES)[number];

export interface QualificationQuestion {
  /** Stable key stored in leads.qualification. Never re-generated for an existing question. */
  slug: string;
  /** The FORM wording — what the lead reads on the landing page. */
  label: string;
  /** The PHONE wording — what the setter reads aloud. Falls back to `label`. */
  phoneLabel?: string;
  type?: AnswerType;
  /** Offered answers for `choice`. Ignored for every other type. */
  options?: string[];
  /** Whether an "egyéb" free text is accepted alongside the options (D11). */
  allowOther?: boolean;
  required?: boolean;
  branch?: Branch;
  audience?: Audience;
  /** Keys of the question sets this question is asked in. A question may be in several. */
  sets?: string[];
  /**
   * Draft Hungarian the spec proposed, not Áron's final wording. The setter UI
   * shows a muted "javaslat" chip for these (no emoji anywhere — portfolio law
   * 2026-09-17). A question edited at /leads/setup is never a draft.
   */
  draft?: boolean;
}

export interface QuestionSet {
  key: string;
  label: string;
}

export const QUESTION_MAX = 40;
export const ANSWER_MAX = 2000;
export const LABEL_MAX = 200;
export const OPTIONS_MAX = 20;
export const SETS_MAX = 10;
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
export const ANSWER_LENGTH_MSG = `A válasz szöveges és legfeljebb ${ANSWER_MAX} karakter lehet`;
export const ANSWER_KEYS_MSG = `Legfeljebb ${ANSWER_KEYS_MAX} válasz küldhető`;
/** Only these reach a user; anything else is zod's English and gets the fallback. */
const OUR_MESSAGES = new Set([ANSWER_LENGTH_MSG, ANSWER_KEYS_MSG]);

export const answersRecordSchema = z
  .record(z.string().max(50), z.string().max(ANSWER_MAX, { message: ANSWER_LENGTH_MSG }))
  .refine((o) => Object.keys(o).length <= ANSWER_KEYS_MAX, { message: ANSWER_KEYS_MSG });

/** The first issue we actually wrote, or the generic Hungarian fallback. */
export function answersErrorMessage(error: z.ZodError): string {
  return error.issues.map((i) => i.message).find((m) => OUR_MESSAGES.has(m)) ?? ANSWER_LENGTH_MSG;
}

// ── Question sets ───────────────────────────────────────────────────

/** Short form — what runs in every ad and everywhere else (raw46 D1, D30). */
export const SET_SHORT = "rovid";
/** Discovery — the questions the setter would otherwise ask on the phone (D23, D28). */
export const SET_DISCOVERY = "felmeres";

export const DEFAULT_QUESTION_SETS: QuestionSet[] = [
  { key: SET_SHORT, label: "Rövid űrlap" },
  { key: SET_DISCOVERY, label: "Felmérő kérdések" },
];

/**
 * The locked qualification model (machines/birdsview/27_qualification_model.md,
 * 2026-09-07, Áron × Kai) plus the two role questions from the 2026-09-20
 * intake design (raw46 D8, D9).
 *
 * The `gate` question branches: A (`task`) asks the seven, B (`curious`) asks
 * the soft three and lands in the nurture pool.
 *
 * The SLUGS ARE PERMANENT — leads.qualification and computeTier() key off them.
 * The HU labels are the spec's draft wording, flagged `draft` so it is obvious
 * on /leads/setup that Áron still owes the final Hungarian. Editing the list
 * there writes tenants.settings.qualificationQuestions and this array stops
 * being used (answers survive, they are keyed by slug).
 */
export const DEFAULT_QUALIFICATION_QUESTIONS: QualificationQuestion[] = [
  // Gate — everyone, both sets. The first question of the short form (D2).
  {
    slug: "gate",
    label: "Van most egy konkrét feladat, amihez ez kellene, vagy egyelőre csak érdekel a technológia?",
    phoneLabel: "Van most konkrét feladat, amihez ez kellene, vagy egyelőre a technológia érdekel?",
    type: "choice",
    options: ["konkrét feladat", "csak a technológia érdekel"],
    required: true,
    sets: [SET_SHORT, SET_DISCOVERY],
    draft: true,
  },
  // Identity — asked in both branches, immediately after the gate (D3).
  {
    slug: "situation",
    label: "Magánszemélyként vagy cégként érdekel?",
    phoneLabel: "Magánszemélyként kérdezel, vagy cég nevében?",
    type: "choice",
    options: ["cég / projekt", "szakember (villanyszerelő, statikus, kivitelező)", "saját ingatlan"],
    required: true,
    sets: [SET_SHORT, SET_DISCOVERY],
    draft: true,
  },
  // Role BEFORE industry (D8) — an industry asked first gets an umbrella word.
  {
    slug: "role",
    label: "Mi a szereped ebben a konkrét projektben?",
    phoneLabel: "Neked mi a szereped ebben a projektben?",
    type: "text",
    allowOther: true,
    branch: "task",
    sets: [SET_SHORT, SET_DISCOVERY],
    draft: true,
  },
  // Same question in general form where there is no project (D9).
  {
    slug: "role_general",
    label: "A főtevékenysége szerint milyen szerepet tölt be a cég?",
    phoneLabel: "A főtevékenységetek szerint milyen szerepben szoktatok dolgozni?",
    type: "text",
    allowOther: true,
    branch: "curious",
    sets: [SET_SHORT, SET_DISCOVERY],
    draft: true,
  },
  // Branch A — `task`, the seven. Discovery only: these are what the setter asks.
  {
    slug: "concrete",
    label: "Mibe kellene belenézni: fal · födém/aljzat · híd/műtárgy · más / nem beton",
    type: "choice",
    options: ["fal", "födém / aljzat", "híd / műtárgy", "más / nem beton"],
    allowOther: true,
    branch: "task",
    sets: [SET_DISCOVERY],
    draft: true,
  },
  {
    slug: "goal",
    label: "Mit szeretnél tudni: mi van benne fúrás előtt · az állapotát · magát a technológiát értékelem",
    type: "choice",
    options: ["mi van benne fúrás előtt", "az állapotát", "magát a technológiát értékelem"],
    allowOther: true,
    branch: "task",
    sets: [SET_DISCOVERY],
    draft: true,
  },
  { slug: "size", label: "Kb. mekkora felület vagy hány pont?", type: "text", branch: "task", sets: [SET_DISCOVERY], draft: true },
  { slug: "postcode", label: "Irányítószám", type: "postcode", required: true, branch: "task", sets: [SET_DISCOVERY], draft: true },
  {
    slug: "timing",
    label: "Mikor: ezen a héten · ebben a hónapban · nincs még dátum",
    type: "choice",
    options: ["ezen a héten", "ebben a hónapban", "nincs még dátum"],
    allowOther: true,
    branch: "task",
    sets: [SET_DISCOVERY],
    draft: true,
  },
  {
    slug: "own_device",
    label: "Gondolkodtatok már saját műszeren?",
    type: "choice",
    options: ["igen", "talán", "nem"],
    branch: "task",
    sets: [SET_DISCOVERY],
    draft: true,
  },
  // Branch B — `curious`, the soft three.
  { slug: "hook", label: "Mi keltette fel az érdeklődésed?", type: "text", allowOther: true, branch: "curious", sets: [SET_DISCOVERY], draft: true },
  { slug: "use_case", label: "Mire használnád, ha lenne ilyen a kezedben?", type: "text", allowOther: true, branch: "curious", sets: [SET_DISCOVERY], draft: true },
  { slug: "work", label: "Milyen munkát végzel / milyen cégnél?", type: "text", allowOther: true, branch: "curious", sets: [SET_DISCOVERY], draft: true },
  // Short form ends on "where do we reach you" (D30). Name and phone are real
  // columns, not answers — this question only carries the wording, so the form
  // and the setter ask it the same way.
  {
    slug: "reach",
    label: "Hol érünk el? (név, telefonszám)",
    phoneLabel: "Jó ez a szám, amiről beszélünk, vagy máshol érünk el könnyebben?",
    type: "contact",
    required: true,
    sets: [SET_SHORT],
    draft: true,
  },
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

// ── Question list parsing ───────────────────────────────────────────

const setKeySchema = z.string().trim().min(1).max(50);

/**
 * One question as stored. Everything past `slug`/`label` is optional so that a
 * settings row written before sets existed still parses — an old
 * `{ slug, label }` row is a valid question that simply declares no set, and
 * `questionsFromSettings` puts it in the discovery set (that is what the flat
 * list was).
 */
const questionSchema = z.object({
  slug: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(LABEL_MAX),
  phoneLabel: z.string().trim().max(LABEL_MAX).optional(),
  type: z.enum(ANSWER_TYPES).optional(),
  options: z.array(z.string().trim().min(1).max(LABEL_MAX)).max(OPTIONS_MAX).optional(),
  allowOther: z.boolean().optional(),
  required: z.boolean().optional(),
  branch: z.enum(BRANCHES).optional(),
  audience: z.enum(AUDIENCES).optional(),
  sets: z.array(setKeySchema).max(SETS_MAX).optional(),
  draft: z.boolean().optional(),
});

const setSchema = z.object({ key: setKeySchema, label: z.string().trim().min(1).max(LABEL_MAX) });

/** Drop empty/undefined keys so the stored JSON stays the shape it reads as. */
function compact(q: z.infer<typeof questionSchema>): QualificationQuestion {
  const out: QualificationQuestion = { slug: q.slug, label: q.label };
  if (q.phoneLabel) out.phoneLabel = q.phoneLabel;
  if (q.type && q.type !== "text") out.type = q.type;
  if (q.type === "choice" && q.options?.length) out.options = q.options;
  if (q.allowOther) out.allowOther = true;
  if (q.required) out.required = true;
  if (q.branch) out.branch = q.branch;
  if (q.audience) out.audience = q.audience;
  if (q.sets?.length) out.sets = [...new Set(q.sets)];
  if (q.draft) out.draft = true;
  return out;
}

/**
 * Read the tenant's question list out of an unvalidated settings blob. Anything
 * malformed falls back to the defaults rather than throwing — a bad settings row
 * must never take the lead page down.
 *
 * A question with no `sets` is put in the discovery set: before sets existed
 * the flat list WAS the setter's discovery list, and a question that belongs to
 * no set at all would silently stop being asked anywhere.
 */
export function questionsFromSettings(settings: unknown): QualificationQuestion[] {
  const raw = (settings as { qualificationQuestions?: unknown } | null)?.qualificationQuestions;
  const parsed = z.array(questionSchema).min(1).max(QUESTION_MAX).safeParse(raw);
  if (!parsed.success) return DEFAULT_QUALIFICATION_QUESTIONS;
  // Duplicate slugs would silently overwrite each other's answers.
  const seen = new Set<string>();
  const unique = parsed.data
    .filter((q) => !seen.has(q.slug) && seen.add(q.slug))
    .map((q) => {
      const c = compact(q);
      return c.sets?.length ? c : { ...c, sets: [SET_DISCOVERY] };
    });
  return unique.length > 0 ? unique : DEFAULT_QUALIFICATION_QUESTIONS;
}

/**
 * The tenant's named sets. Every set a question references is guaranteed to
 * exist in the returned list, so the editor can never render a question into a
 * set that has no name.
 */
export function setsFromSettings(settings: unknown, questions: QualificationQuestion[]): QuestionSet[] {
  const raw = (settings as { qualificationSets?: unknown } | null)?.qualificationSets;
  const parsed = z.array(setSchema).min(1).max(SETS_MAX).safeParse(raw);
  const seen = new Set<string>();
  const out = (parsed.success ? parsed.data : DEFAULT_QUESTION_SETS).filter(
    (s) => !seen.has(s.key) && seen.add(s.key),
  );
  for (const q of questions) {
    for (const key of q.sets ?? []) {
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ key, label: key });
      }
    }
  }
  return out;
}

/** Questions in a named set, in the tenant's stored order. */
export function questionsInSet(questions: QualificationQuestion[], setKey: string): QualificationQuestion[] {
  return questions.filter((q) => (q.sets ?? []).includes(setKey));
}

/** What the setter reads aloud: the phone wording if there is one, else the form wording. */
export function phoneWording(q: QualificationQuestion): string {
  return q.phoneLabel?.trim() || q.label;
}

/**
 * Validate a question list submitted by the /leads/setup editor. Structured, not
 * line-based: a question now carries options, flags and set membership, and
 * encoding those into one text line is how a slug gets mistyped.
 *
 * Slugs are NOT re-derived here. The editor sends back the slug it was given,
 * so re-wording a question keeps its statistics bucket; only a question the
 * editor created with no slug gets one from `slugifyQuestion`.
 */
export function parseQuestionList(raw: unknown): QualificationQuestion[] | { error: string } {
  const parsed = z.array(questionSchema.partial({ slug: true })).safeParse(raw);
  if (!parsed.success) return { error: "Hibás kérdéslista" };
  if (parsed.data.length === 0) return { error: "Legalább egy kérdés kell" };
  if (parsed.data.length > QUESTION_MAX) return { error: `Legfeljebb ${QUESTION_MAX} kérdés lehet` };

  const out: QualificationQuestion[] = [];
  const seen = new Set<string>();
  for (const q of parsed.data) {
    const slug = (q.slug ?? "").trim() || slugifyQuestion(q.label);
    if (seen.has(slug)) return { error: `Két kérdés azonos azonosítót kapna: ${slug}` };
    seen.add(slug);
    if (q.type === "choice" && !(q.options ?? []).length) {
      return { error: `Válaszlehetőség nélküli választós kérdés: ${slug}` };
    }
    out.push(compact({ ...q, slug }));
  }
  return out;
}

/** Validate the tenant's set list submitted by the editor. */
export function parseQuestionSets(raw: unknown): QuestionSet[] | { error: string } {
  const parsed = z.array(setSchema).safeParse(raw);
  if (!parsed.success) return { error: "Hibás kérdéscsoport" };
  if (parsed.data.length === 0) return { error: "Legalább egy kérdéscsoport kell" };
  if (parsed.data.length > SETS_MAX) return { error: `Legfeljebb ${SETS_MAX} kérdéscsoport lehet` };
  const seen = new Set<string>();
  for (const s of parsed.data) {
    if (seen.has(s.key)) return { error: `Két kérdéscsoport azonos azonosítót kapna: ${s.key}` };
    seen.add(s.key);
  }
  return parsed.data;
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
  if (!parsed.success) return { error: answersErrorMessage(parsed.error) };
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

// ── Answer provenance (leads.answer_sources) ────────────────────────

export const ORIGINS = ["form", "setter"] as const;
export type AnswerOrigin = (typeof ORIGINS)[number];

export interface AnswerRecord {
  /** The answer itself. */
  value: string;
  /** ISO timestamp of when it was given. */
  at: string;
  /** Which question set the form used. Form answers only, optional. */
  set?: string;
  /** Campaign the answer arrived on. Form answers only, optional. */
  campaign?: string;
  /** Who typed it. Setter answers only, optional. */
  by?: string;
}

/** Per slug: what the form said, and what the setter said. Both are kept. */
export type AnswerSources = Record<string, Partial<Record<AnswerOrigin, AnswerRecord>>>;

const answerRecordSchema = z.object({
  value: z.string().max(ANSWER_MAX),
  at: z.string().max(40),
  set: z.string().max(50).optional(),
  campaign: z.string().max(200).optional(),
  by: z.string().max(200).optional(),
});

const slugSourcesSchema = z.object({
  form: answerRecordSchema.optional(),
  setter: answerRecordSchema.optional(),
});

/**
 * Stored provenance, tolerating a null/garbage column.
 *
 * Parsed PER SLUG, not as one object: an all-or-nothing schema meant a single
 * malformed record (a hand-edited row, an over-long value) returned `{}`, and
 * the next setter save persisted that `{}` — every other slug's provenance
 * destroyed permanently, for one bad entry. (Vanda, #113.)
 */
export function answerSourcesFrom(raw: unknown): AnswerSources {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: AnswerSources = {};
  for (const [slug, rec] of Object.entries(raw as Record<string, unknown>)) {
    if (slug.length > 50) continue;
    const parsed = slugSourcesSchema.safeParse(rec);
    if (parsed.success && (parsed.data.form || parsed.data.setter)) out[slug] = parsed.data;
  }
  return out;
}

/**
 * The answers every statistic and computeTier() sees.
 *
 * The SETTER's answer is the current one — they heard the person say it, after
 * the form was filled. The form answer is not overwritten, only outranked.
 */
export function effectiveAnswers(sources: AnswerSources): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slug, rec] of Object.entries(sources)) {
    const v = (rec.setter?.value ?? rec.form?.value ?? "").trim();
    if (v) out[slug] = v;
  }
  return out;
}

/**
 * Write one origin's answers into the provenance map, returning a new map.
 *
 * Only the slugs SUBMITTED are touched, and a blank clears that origin's answer
 * (not the other origin's): a setter who deletes what they typed falls back to
 * what the form said, which is the truthful state, not an empty one.
 */
export function withAnswers(
  sources: AnswerSources,
  origin: AnswerOrigin,
  answers: Record<string, string>,
  meta: Omit<AnswerRecord, "value" | "at"> & { at?: string } = {},
): AnswerSources {
  const { at = new Date().toISOString(), ...rest } = meta;
  const out: AnswerSources = { ...sources };
  for (const [slug, raw] of Object.entries(answers)) {
    const value = (raw ?? "").trim();
    const prev = { ...(out[slug] ?? {}) };
    if (!value) delete prev[origin];
    else prev[origin] = { value, at, ...rest };
    if (Object.keys(prev).length === 0) delete out[slug];
    else out[slug] = prev;
  }
  return out;
}

/**
 * Provenance for a lead that predates `answer_sources`: its stored answers with
 * no origin recorded. They are shown as unknown-origin rather than guessed into
 * a block, so nothing claims a form said something it may not have.
 */
export function legacyAnswers(sources: AnswerSources, qualification: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slug, value] of Object.entries(qualification)) {
    if (!sources[slug]) out[slug] = value;
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
