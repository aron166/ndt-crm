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
  return (v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Words of a folded answer. Splitting on non-alphanumerics is what gives us word
 * boundaries, and word boundaries are the whole point: the old matcher used bare
 * `includes()`, so "hanem" contained "nem" and "masszív" contained "más".
 */
function words(v: string): string[] {
  return v.split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * A keyword of MIN_PREFIX+ characters matches a word by PREFIX — Hungarian
 * agglutinates, so "technológiát" has to hit "technolog". Anything shorter must
 * match a whole word EXACTLY, which is what stops "más" firing on "masszív" and
 * "nem" firing on "nemrég". Multi-word keywords match as a consecutive phrase.
 */
const MIN_PREFIX = 4;

function wordMatches(word: string, part: string): boolean {
  return part.length >= MIN_PREFIX ? word.startsWith(part) : word === part;
}

/** Index of the first word at which `keyword` matches, or -1. */
function keywordAt(ws: string[], keyword: string): number {
  const parts = words(keyword);
  if (!parts.length) return -1;
  for (let i = 0; i + parts.length <= ws.length; i++) {
    if (parts.every((part, j) => wordMatches(ws[i + j], part))) return i;
  }
  return -1;
}

// A hit inside this many words AFTER a negator is discarded. Three covers the
// Hungarian article + adverb that usually sit between: "nem a technológia
// érdekel" must NOT tier as goal=technology — that answer says the opposite,
// and tier A means "call within 1 hour".
const NEGATORS = new Set(["nem", "nincs", "nincsen", "sem", "no", "not", "nelkul"]);
const NEG_WINDOW = 3;

// "nem tégla, HANEM beton" — the contrastive cancels the negation and the word
// after it is the real answer. Scanning back from a hit stops at one of these,
// so only a negator with nothing between it and the keyword counts.
const NEG_BARRIERS = new Set(["hanem", "de", "viszont", "azonban", "csak", "but"]);

function negatedAt(ws: string[], i: number): boolean {
  for (let j = i - 1; j >= Math.max(0, i - NEG_WINDOW); j--) {
    if (NEG_BARRIERS.has(ws[j])) return false;
    if (NEGATORS.has(ws[j])) return true;
  }
  return false;
}

/** True when any keyword matches on a word boundary and is not negated. */
function hits(ws: string[], keywords: readonly string[]): boolean {
  return keywords.some((k) => {
    const i = keywordAt(ws, k);
    return i >= 0 && !negatedAt(ws, i);
  });
}

function match<T extends string>(value: string | undefined, table: Record<T, readonly string[]>): T | null {
  const v = fold(value);
  if (!v) return null;
  const ws = words(v);
  for (const [token, keywords] of Object.entries(table) as [T, readonly string[]][]) {
    if (v === token) return token;
    if (hits(ws, keywords)) return token;
  }
  return null;
}

// ponytail: keyword lists, not an NLP pass — the landing form sends the token
// itself and this only has to catch what a setter actually types. Accented
// spellings are pointless here: fold() strips accents before matching.
const SITUATION = {
  // "projekt" was here and matched "családi ház projekt" — a private lead typing
  // the single commonest Hungarian word for a job. Removed. (Vanda, #81.)
  company: ["company", "ceg", "ceges", "cegunk", "kft", "zrt", "bt", "vallalkoz"],
  pro: ["pro", "szakember", "villanyszerel", "statikus", "kivitelez", "epitesz", "muszaki ellenor"],
  private: ["private", "magan", "sajat ingatlan", "csaladi haz", "lakas"],
} as const;

// Key order IS the match order (Object.entries), so the kill answers go first.
// The bare "nem" that used to live in `no` is gone — it made "fal, de nem tudjuk
// pontosan hol" a NON-concrete answer. Negation is handled by negatedAt() now.
const CONCRETE = {
  no: ["nem beton", "mas", "other", "none"],
  yes: ["yes", "igen", "fal", "wall", "fodem", "aljzat", "slab", "hid", "bridge", "mutargy", "beton", "concrete", "padlo"],
} as const;

const GOAL = {
  technology: ["technolog", "technology", "ertekel", "muszer"],
  drill: ["furas", "drill", "mi van benne"],
  condition: ["allapot", "condition"],
} as const;

const OWN_DEVICE = {
  no: ["nem", "no", "nincs"],
  maybe: ["maybe", "talan", "lehet"],
  yes: ["yes", "igen"],
} as const;

const GATE = {
  task: ["task", "feladat", "konkret"],
  // "érdeklődöm" — the commonest form by far — does not start with "erdekel",
  // so a curious lead used to fall through to the company branch and could come
  // out tier A. (Vanda, #81.)
  curious: ["curious", "erdekel", "erdeklod", "nezelod", "tajekozod", "csak nez"],
} as const;

/** Timing answers that mean "no date named". */
const NO_DATE = ["no_date", "nincs", "nem tudom", "meg nincs", "nincs datum"];

/** True when the lead named ANY timeframe ("nincs még dátum" is not one). */
function timingSet(answer: string | undefined): boolean {
  const ws = words(fold(answer));
  if (!ws.length) return false;
  return !NO_DATE.some((k) => keywordAt(ws, k) >= 0);
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
