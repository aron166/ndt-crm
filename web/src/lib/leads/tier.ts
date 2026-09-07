// Lead tier (A–E) — DERIVED, never submitted. Pure module: no DB, no server-only
// import, so the UI, the intake API and the setter panel all share one truth.
//
// Rules are verbatim from the locked qualification model
// (machines/birdsview/27_qualification_model.md, 2026-09-07, Áron × Kai):
//
//   A machine prospect  situation=company AND (own_device∈{yes,maybe} OR goal=technology)
//   B company job       situation=company, concrete=yes, timing set
//   C professional      situation=pro
//   D private           situation=private
//   E nurture           Branch B (gate=curious)
//
// One deliberate deviation from the literal table: the spec writes A's machine
// signal as "own_device≠no". Read literally, an UNANSWERED own_device is ≠ no,
// which would make every company lead tier A ("call within 1 h, outranks
// everything"). So A needs a positive signal: own_device answered yes/maybe, or
// goal=technology.

export const TIERS = ["A", "B", "C", "D", "E"] as const;
export type LeadTier = (typeof TIERS)[number];

export const TIER_LABEL: Record<LeadTier, string> = {
  A: "Gépérdeklődő",
  B: "Céges munka",
  C: "Szakember",
  D: "Magánszemély",
  E: "Nurture",
};

/** Board/card colours. Keyed to the existing CSS vars so themes stay in one place. */
export const TIER_COLOR: Record<LeadTier, string> = {
  A: "var(--coral)",
  B: "var(--indigo)",
  C: "var(--sky)",
  D: "var(--amber)",
  E: "var(--fg-faint)",
};

// ── Answer normalisation ────────────────────────────────────────────
// The landing form posts canonical tokens; a setter types Hungarian free text
// into the same slots. Both must tier the same way, so every answer is folded to
// lowercase-unaccented and matched against a keyword table. No match → null
// ("not answered"), never a guess.

function fold(v: string | undefined | null): string {
  return (v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function match<T extends string>(value: string | undefined, table: Record<T, readonly string[]>): T | null {
  const v = fold(value);
  if (!v) return null;
  for (const [token, keywords] of Object.entries(table) as [T, readonly string[]][]) {
    if (v === token) return token;
    if (keywords.some((k) => v.includes(k))) return token;
  }
  return null;
}

// ponytail: keyword lists, not an NLP pass — the landing form sends the token
// itself and this only has to catch what a setter actually types.
const SITUATION = {
  company: ["company", "ceg", "cég", "projekt", "kft", "zrt", "bt.", "vallalkoz"],
  pro: ["pro", "szakember", "villanyszerel", "statikus", "kivitelez", "epitesz", "muszaki ellenor"],
  private: ["private", "magan", "sajat ingatlan", "csaladi haz", "lakas"],
} as const;

// Key order IS the match order (Object.entries): the kill answers go first, so
// "nem beton" cannot match on the substring "beton".
const CONCRETE = {
  no: ["nem beton", "mas ", "other", "none", "nem"],
  yes: ["yes", "igen", "fal", "wall", "fodem", "aljzat", "slab", "hid", "bridge", "mutargy", "beton", "concrete", "padlo"],
} as const;

const GOAL = {
  technology: ["technolog", "technology", "ertekelem", "muszer"],
  drill: ["furas", "fúrás", "drill", "mi van benne"],
  condition: ["allapot", "condition"],
} as const;

const OWN_DEVICE = {
  no: ["nem", "no"],
  maybe: ["maybe", "talan", "lehet"],
  yes: ["yes", "igen"],
} as const;

const GATE = {
  task: ["task", "feladat", "konkret"],
  curious: ["curious", "erdekel", "csak nez", "technologia erdekel"],
} as const;

/** True when the lead named ANY timeframe ("nincs még dátum" is not one). */
function timingSet(answer: string | undefined): boolean {
  const v = fold(answer);
  if (!v) return false;
  return !["no_date", "nincs", "nem tudom", "meg nincs", "nincs datum"].some((k) => v.includes(k));
}

/**
 * The lead's tier, or null when the answers don't place it yet (no `situation`,
 * or a company lead that is neither a machine prospect nor a booked-able job).
 * null means "no badge" — never a silent A/B.
 */
export function computeTier(answers: Record<string, string>): LeadTier | null {
  const gate = match(answers.gate ?? answers.intent_path, GATE);
  if (gate === "curious") return "E";

  const situation = match(answers.situation, SITUATION);
  if (!situation) return null;

  if (situation === "pro") return "C";
  if (situation === "private") return "D";

  // situation === "company"
  const ownDevice = match(answers.own_device, OWN_DEVICE);
  const goal = match(answers.goal, GOAL);
  if (ownDevice === "yes" || ownDevice === "maybe" || goal === "technology") return "A";

  const concrete = match(answers.concrete, CONCRETE);
  if (concrete === "yes" && timingSet(answers.timing)) return "B";

  // Company, no machine signal, and not a scannable job with a date: not yet
  // placeable. The setter's next answer re-tiers it.
  return null;
}

export function isTier(v: unknown): v is LeadTier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}
