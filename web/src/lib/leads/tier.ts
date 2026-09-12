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
 * Words of a folded answer, plus `|` as an explicit CLAUSE BREAK.
 *
 * Word boundaries are the point: the old matcher used bare `includes()`, so
 * "hanem" contained "nem" and "masszív" contained "más". Punctuation becomes a
 * token rather than being thrown away, because a comma is the strongest
 * negation barrier Hungarian has — in "nem cég, magánszemély" the negation ends
 * at the comma. Keywords never contain `|`, so this cannot affect a match.
 */
function words(v: string): string[] {
  return v.replace(/[,;.!?:]+/g, " | ").split(/[^a-z0-9|]+/).filter(Boolean);
}

/**
 * A keyword ending in `*` matches a word by PREFIX — Hungarian agglutinates, so
 * "cégem" / "cégnél" / "falban" / "hidat" all have to hit their stem. Everything
 * else must match a whole word EXACTLY, which is what stops "más" firing on
 * "masszív" and "pro" on "projekt".
 *
 * Every keyword declares its own mode. An earlier revision inferred it from
 * keyword length (>= 4 chars meant prefix), which silently disabled all six
 * three-letter stems in the tables below and cost more leads than the bug it
 * replaced. (Vanda, #84.)
 */
function wordMatches(word: string, part: string): boolean {
  return part.endsWith("*") ? word.startsWith(part.slice(0, -1)) : word === part;
}

/** Index of the first word at which `keyword` matches, or -1. */
function keywordAt(ws: string[], keyword: string): number {
  const parts = keyword.split(" ").filter(Boolean);
  if (!parts.length) return -1;
  for (let i = 0; i + parts.length <= ws.length; i++) {
    if (parts.every((part, j) => wordMatches(ws[i + j], part))) return i;
  }
  return -1;
}

// A hit inside this many words AFTER a negator is discarded: "nem a technológia
// érdekel" must NOT tier as goal=technology — that answer says the opposite, and
// tier A means "call within 1 hour".
const NEGATORS = new Set(["nem", "nincs", "nincsen", "sem", "no", "not", "nelkul"]);
const NEG_WINDOW = 3;

// Scanning back from a hit stops at a barrier, so only a negator with nothing
// between it and the keyword counts. "nem tégla, HANEM beton" is concrete; so is
// "nem tudom, beton vagy tégla", via the `|` clause break.
const NEG_BARRIERS = new Set(["|", "hanem", "de", "viszont", "azonban", "but"]);

function negatedAt(ws: string[], i: number): boolean {
  for (let j = i - 1; j >= Math.max(0, i - NEG_WINDOW); j--) {
    if (NEG_BARRIERS.has(ws[j])) return false;
    // "nem csak fal" is "not ONLY a wall" — an addition, not a denial.
    if (NEGATORS.has(ws[j])) return ws[j + 1] !== "csak";
  }
  return false;
}

/** Earliest word index at which any keyword matches un-negated, or -1. */
function hitAt(ws: string[], keywords: readonly string[]): number {
  let best = -1;
  for (const k of keywords) {
    const i = keywordAt(ws, k);
    if (i >= 0 && !negatedAt(ws, i) && (best === -1 || i < best)) best = i;
  }
  return best;
}

/**
 * The first token in TABLE ORDER whose keyword hits un-negated anywhere in the
 * answer. Key order is therefore a PRIORITY, and every table below says out loud
 * why its order is what it is: kill answers first where a wrong yes is
 * expensive, the strongest positive signal first where a wrong no loses a lead.
 *
 * A short-lived revision ranked by keyword POSITION instead ("what the lead said
 * first wins"). It fixed one answer and broke three classes: "Érdeklődnék, de
 * konkrét feladatunk van" fell to the curious gate, "Falban, de nem beton"
 * became a concrete job, and "Saját ingatlan, de a cégem nevén" became private.
 * Position is not priority. The one table that genuinely needed a different
 * answer got a different ORDER instead. (Vanda, #87.)
 */
function match<T extends string>(value: string | undefined, table: Record<T, readonly string[]>): T | null {
  const v = fold(value);
  if (!v) return null;
  const ws = words(v);
  for (const [token, keywords] of Object.entries(table) as [T, readonly string[]][]) {
    if (v === token) return token;
    if (hitAt(ws, keywords) >= 0) return token;
  }
  return null;
}

// ponytail: keyword lists, not an NLP pass — the landing form sends the token
// itself and this only has to catch what a setter actually types. Accented
// spellings are pointless here: fold() strips accents before matching.
const SITUATION = {
  // "projekt" was here and matched "családi ház projekt" — a private lead typing
  // the commonest Hungarian word for a job. It is also why `pro` below is exact
  // and the stem is "profi*": "pro*" would match "projekt" all over again.
  company: ["company", "ceg*", "kft", "zrt", "bt", "vallalkoz*"],
  pro: ["pro", "profi*", "szakember*", "villanyszerel*", "statikus*", "kivitelez*", "epitesz*", "muszaki ellenor*"],
  private: ["private", "magan*", "sajat ingatlan*", "csaladi haz*", "lakas*"],
} as const;

// Key order IS the match order (Object.entries), so the kill answers go first.
// The bare "nem" that used to live in `no` is gone — it made "fal, de nem tudjuk
// pontosan hol" a NON-concrete answer. Negation is negatedAt()'s job now.
const CONCRETE = {
  no: ["nem beton*", "mas", "other", "none"],
  yes: ["yes", "igen", "fal*", "wall*", "fodem*", "aljzat*", "slab*", "hid*", "bridge*", "mutargy*", "beton*", "concrete*", "padlo*"],
} as const;

// `condition` is FIRST on purpose: "állapot értékelés" contains an evaluation
// verb, and if `technology` were checked first that answer would tier A —
// "call within 1 hour" — for a routine condition survey. (Vanda, #84.)
// `technology` is a tier-A signal ("call within 1 hour"), so it takes a POSITIVE
// statement. A bare "muszer*" used to live here and tiered "Milyen műszerrel
// csinálják?" — a question about HOW WE work, the most ordinary thing an inbound
// lead asks — as a machine prospect. The cure for that is the enquiry guard in
// isEnquiry(), NOT throwing the keyword away: "Saját műszert szeretnénk venni"
// typed into this slot is a machine prospect and must still reach A.
// (Lars, 2026-09-08; Vanda, #87.)
//
// `condition` is FIRST on purpose: "állapot értékelés" is a routine condition
// survey, not a technology enquiry. (Vanda, #84.)
const GOAL = {
  condition: ["allapot*", "condition*"],
  technology: ["technolog*", "sajat muszer*", "muszert venn*", "muszervasarl*", "muszert szeretn*"],
  drill: ["furas*", "drill*", "mi van benne"],
} as const;

/**
 * True for an answer that ASKS something rather than states it — "Milyen
 * műszerrel csinálják?", "Milyen technológiával dolgoznak?". An enquiry carries
 * no signal about the lead, so it must not tier them; without this guard every
 * sibling of the reported question would have to be blacklisted one by one.
 * Both halves are required: an interrogative opener AND a question mark, so
 * "Mikor tudnak jönni? Sürgős." stays a question but "milyen jó lenne" does not.
 */
const INTERROGATIVES = ["milyen", "milyet", "hogyan", "mivel", "mennyi*", "miert", "hol", "mikor", "mit", "mi"];

function isEnquiry(raw: string | undefined | null): boolean {
  if (!raw || !raw.includes("?")) return false;
  const ws = words(fold(raw));
  return ws.length > 0 && INTERROGATIVES.some((q) => wordMatches(ws[0], q));
}

// The machine-prospect signal, and the one table whose order is POSITIVE-FIRST.
// The answer to "van saját műszered?" nearly always opens with nem/nincs and
// then says the interesting part — "Nincs, de vásárolnánk egyet", "Nem, de
// gondolkodunk rajta". Both are machine prospects; ranking the kill answer first
// threw them away. A bare "nem" with nothing positive anywhere still lands on
// `no`, because `no` is simply last.
//
// Ownership and purchase intent are stated POSITIVELY here — never inferred from
// a `goal` keyword — so asking about our instruments cannot read as owning one.
// `berel*` is deliberately absent: renting is a job, not a machine sale. So is
// "van sajat*", which fired on "van saját szakemberünk, műszer nincs". (Vanda, #87.)
const OWN_DEVICE = {
  yes: ["yes", "igen", "sajat muszer*", "sajat gep*", "van muszer*", "van gep*"],
  maybe: ["maybe", "talan*", "lehet*", "vasarol*", "beszerz*", "beszerez*", "vennenk", "venni szeretn*", "gondolkod*"],
  no: ["nem", "no", "nincs*"],
} as const;

const GATE = {
  task: ["task", "feladat*", "konkret*"],
  // "érdeklődöm" — the commonest form by far — does not start with "erdekel",
  // so a curious lead used to fall through to the company branch and could come
  // out tier A. "nez*" is deliberately NOT a bare keyword: "nézzük meg a falat"
  // is a job, not a browse.
  curious: ["curious", "erdekel*", "erdeklod*", "nezelod*", "tajekozod*", "csak nez*", "korulnez*"],
} as const;

/**
 * Timing answers that mean "no date named" — undecided phrasings only. They are
 * checked ONLY when the answer names no date at all (see timingSet), because
 * they are routinely bolted onto a real one: "Október 5-én, majd egyeztetünk"
 * and "Nem biztos, de október 5-én kezdünk" both name a date.
 *
 * Bare "majd" and "valamikor" were here for one revision and demoted every
 * company lead whose date happened to carry a filler adverb — the exact inverse
 * of the bug they were added for. (Vanda, #87.)
 */
const NO_DATE = [
  "no date",
  "nincs*",
  "nem tudom",
  "nem tudjuk",
  "meg nincs*",
  "nincs datum*",
  "meg nem",
  "nem dolt*",
  "nem dontott*",
  "nem biztos",
  "nem hatarozt*",
  "valamikor",
];

/**
 * Tokens that name an actual point in time. Seasons are deliberately absent:
 * "valamikor ősszel" is a shrug with a season attached, not a date.
 */
const DATE_SIGNAL = [
  "januar*", "februar*", "marcius*", "aprilis*", "majus*", "junius*",
  "julius*", "augusztus*", "szeptember*", "oktober*", "november*", "december*",
  "hetfo*", "kedd*", "szerda*", "szerdan*", "csutortok*", "pentek*", "szombat*", "vasarnap*",
  "holnap*", "jovo", "jovore", "kovetkezo", "ma", "azonnal*", "surgos*",
];

const HAS_NUMBER = /\d/;

/**
 * True when the lead named ANY timeframe.
 *
 * A named date always wins: the undecided list is consulted only when nothing in
 * the answer points at a point in time. An answer with neither — "jövő héten",
 * "két hét múlva" — still counts, which is the permissive default this has
 * always had; only an explicit shrug turns it off.
 */
function timingSet(answer: string | undefined): boolean {
  const folded = fold(answer);
  const ws = words(folded);
  if (!ws.length) return false;
  if (HAS_NUMBER.test(folded)) return true;
  if (DATE_SIGNAL.some((k) => keywordAt(ws, k) >= 0)) return true;
  return !NO_DATE.some((k) => keywordAt(ws, k) >= 0);
}

export function computeTier(answers: Record<string, string>): LeadTier | null {
  const gate = match(answers.gate ?? answers.intent_path, GATE);
  if (gate === "curious") return "E";

  const situation = match(answers.situation, SITUATION);
  if (!situation) return null;

  if (situation === "pro") return "C";
  if (situation === "private") return "D";

  // situation === "company"
  const ownDevice = match(answers.own_device, OWN_DEVICE);
  // An enquiry states nothing about the lead, so it tiers nothing.
  const goal = isEnquiry(answers.goal) ? null : match(answers.goal, GOAL);
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
