// Blocking content rules (spec, Áron 2026-09-17): "hard checks only, code not
// prose". These run in addition to the imported ⚠ checks (see warnings.ts)
// when an item is SUBMITTED or a NEW VERSION is posted. A failed rule blocks
// the item from going live exactly like an open ⚠ check, names the rule, and
// sends the item back to the AI queue (not a human): see the pipeline
// wiring in service.ts, which this module knows nothing about.
//
// PURE, table-driven, no DB/network/Next import: one module so the rule
// list can be edited without touching the pipeline.
//
// Forbidden-claims source of truth: growth/campaigns/cold-email-v0/
// FRAMEWORK.md §6 "Állítás-korlátok: ZÁRT LISTA". Only what that list
// actually forbids is encoded here; no new product claims invented.

export type RuleSeverity = "block"; // only blocking rules for now

export interface RuleContext {
  category: string; // content category (email | script | ad | …)
  format?: string | null;
  body: string;
  /** Tenant consent/unsubscribe footer, when one is configured. */
  footer?: string | null;
  /** Verified recipient? false when recipients.csv says verify_before_send. */
  recipientVerified?: boolean | null;
  /** First ~200 chars of the opening hook of every OTHER item in the same campaign. */
  otherHooks?: string[];
  /** The item requires a consent footer (cold outreach email). */
  requiresFooter?: boolean;
}

export interface RuleViolation {
  rule: string;
  message: string;
  excerpt?: string;
}

export interface ContentRule {
  id: string; // stable key, e.g. "forbidden_price"
  /** Hungarian, shown to the human and to the AI: what is wrong and what to do. */
  message: string;
  appliesTo: (ctx: RuleContext) => boolean;
  check: (ctx: RuleContext) => { ok: true } | { ok: false; excerpt?: string };
}

// The claim rules (1-7) apply to any outbound copy category: cold email is
// the only one drafted today, script/ad share the same claim discipline.
const CLAIM_CATEGORIES = new Set(["email", "script", "ad"]);
const isClaimCategory = (ctx: RuleContext) => CLAIM_CATEGORIES.has(ctx.category);
const isEmail = (ctx: RuleContext) => ctx.category === "email";

/**
 * Real touch bodies in growth/campaigns/cold-email-v0/drafts/*.md run
 * ~350-700 chars (salutation to sign-off); the longest measured across all
 * 19 companies x 4 touches is ~1,090 chars. 1800 gives ~65% headroom above
 * that longest real body (room for a footer, a longer intro) while still
 * catching a runaway/duplicated generation.
 */
export const BODY_MAX_CHARS_EMAIL = 1800;

function excerptAt(body: string, index: number, len = 40): string {
  return body.slice(Math.max(0, index - 5), index + len).trim();
}

// NOTE on \b: JS's \b only knows ASCII [A-Za-z0-9_] as "word" characters, so
// on Hungarian text a plain \b sits in the wrong place next to any accented
// letter (á/é/í/ó/ö/ő/ú/ü/ű): e.g. "\bár\b" wrongly matches inside
// "felt|ár|ás" because \w treats "á" as a non-word char. Every whole-word
// pattern below therefore uses a Unicode-aware boundary,
// (?<!\p{L})…(?!\p{L}) with the /u flag, instead of \b.
const NOT_LETTER_BEFORE = "(?<!\\p{L})";
const NOT_LETTER_AFTER = "(?!\\p{L})";

// --- 1. forbidden_price -----------------------------------------------
// FRAMEWORK §6: "ár bármilyen formában": price/fee, in any form.
const PRICE_CURRENCY_RE = /\d[\d.,\s]*\s?(ft|huf|eur)(?!\p{L})|\d[\d.,\s]*\s?[€$]|[€$]\s?\d/iu;
// Whole-word only, so "árazniuk"/"felárral" (their pricing, not ours) don't
// match: "ajánlat" alone is fine, only the price-compound "árajánlat*" is not.
const PRICE_WORD_RE = new RegExp(
  `${NOT_LETTER_BEFORE}(ár|árat|árajánlat\\p{L}*|díj\\p{L}*)${NOT_LETTER_AFTER}`,
  "iu",
);

// --- 2. forbidden_depth -------------------------------------------------
// FRAMEWORK §6: "80 cm mélység": a depth number is not true, never send one.
// cm is unambiguous in this domain; a bare "m" only counts near "mély" so we
// don't flag every metric mention (e.g. "600 m² két óra alatt" is allowed).
const DEPTH_UNIT_RE = /\d+([.,]\d+)?\s?(cm|m)(?!²)(?!\p{L})/giu;

// --- 3. forbidden_report_time --------------------------------------------
// FRAMEWORK §6: "72 órás riport": no such thing, result is real-time on site.
const REPORT_TIME_RE = /\d+\s?(órán\s?belül|órás?|h)(?!\p{L})/iu;

// --- 4. forbidden_throughput ----------------------------------------------
// FRAMEWORK §6: "akár 500 m²/óra": not from a public source.
const THROUGHPUT_RE = /m²\s*\/\s*óra/i;

// --- 5. forbidden_tolerance -------------------------------------------
// FRAMEWORK §6: "±1-4 mm": any ± tolerance number.
const TOLERANCE_RE = /±\s?\d|\+\s?\/\s?-\s?\d|plusz-mínusz/i;

// --- 6. forbidden_xray ----------------------------------------------------
// FRAMEWORK §6: "röntgen / X-ray / betonátvilágítás röntgenként": we don't
// use radiation. A sentence that says so explicitly (negated) is fine.
const XRAY_RE = /röntgen\p{L}*|x-?ray|átvilágítás\p{L}*/iu;
const NEGATION_RE = new RegExp(
  `${NOT_LETTER_BEFORE}(nincs|nem)${NOT_LETTER_AFTER}|nélkül`,
  "iu",
);

// --- 7. forbidden_reference -------------------------------------------
// FRAMEWORK §6: vasúti/kikötői/kórházi reference: we have none.
const REFERENCE_RE = new RegExp(`${NOT_LETTER_BEFORE}(vasúti|kikötői|kórházi)${NOT_LETTER_AFTER}`, "iu");

// --- 8. unfilled_placeholder ------------------------------------------
const PLACEHOLDER_RE = /<[^<>\s]+>|\bTODO\b|\u26A0/;

// --- 11. no_personal_hook -----------------------------------------------
// Conservative on purpose: fires only when the opening has NEITHER a year,
// NOR a mid-sentence capitalised proper noun, NOR any service/project
// vocabulary: i.e. a genuinely generic, could-be-sent-to-anyone opener.
// Checked against the first ~400 chars (roughly the first two paragraphs),
// not just the literal first paragraph, so a short "nem húzom tovább"
// breakup opener that gets to the point in its second paragraph still
// passes (see a-hid touch 4 in the regression block below).
const YEAR_RE = /(?<!\p{L})(19|20)\d{2}(?!\p{L})/u;
// Hungarian always capitalises the formal "Ön/Önök" mid-sentence: that is
// NOT a proper noun, so it's excluded or the rule would fire on every
// second formal sentence.
const MID_SENTENCE_CAP_RE = /[a-záéíóöőúüű][^\s.!?]*\s+(?!Ön\b|Önök\b|Önnek\b|Önöknek\b)[A-ZÁÉÍÓÖŐÚÜŰ]/u;
const PROJECT_WORD_RE = new RegExp(
  `${NOT_LETTER_BEFORE}(georadar|beton|szerkezet|fúrás|vasal|vaskiosztás|betontakarás|mérés|projekt|híd|épület|csarnok|gépház|terminál|kocsiszín|létesítmény|beruházás|munkájuk|oldalukon|honlapjukon|weboldalukon|áttörés|szkennel|átmérő)\\p{L}*`,
  "iu",
);

function hasHook(body: string): boolean {
  const opening = body.slice(0, 400);
  return YEAR_RE.test(opening) || MID_SENTENCE_CAP_RE.test(opening) || PROJECT_WORD_RE.test(opening);
}

// --- 13. duplicate_hook -------------------------------------------------
function normalizeHook(s: string): string {
  return s.slice(0, 120).toLowerCase().replace(/\s+/g, " ").trim();
}

// Plain Levenshtein distance: small inputs (<=120 chars), no dependency.
function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export const CONTENT_RULES: ContentRule[] = [
  {
    id: "forbidden_price",
    message:
      "Tilos áreallítás (ár/díj/árajánlat, vagy szám + Ft/HUF/EUR/€/$) a hideg szövegben (FRAMEWORK §6). Vedd ki az árra utaló részt, árat sosem közlünk hideg megkeresésben.",
    appliesTo: isClaimCategory,
    check: (ctx) => {
      const m = ctx.body.match(PRICE_CURRENCY_RE) ?? ctx.body.match(PRICE_WORD_RE);
      return m ? { ok: false, excerpt: excerptAt(ctx.body, m.index ?? 0) } : { ok: true };
    },
  },
  {
    id: "forbidden_depth",
    message:
      "Tilos konkrét mélységszám (pl. „80 cm”, „0,8 m mélyen”): a FRAMEWORK szerint nem igaz és hideg levélbe nem megy. Vedd ki a mélységszámot, szám nélkül fogalmazz.",
    appliesTo: isClaimCategory,
    check: (ctx) => {
      const matches = [...ctx.body.matchAll(DEPTH_UNIT_RE)];
      const hasMely = /mély/i.test(ctx.body);
      const hit = matches.find((m) => hasMely || m[2].toLowerCase() === "cm");
      return hit ? { ok: false, excerpt: excerptAt(ctx.body, hit.index ?? 0) } : { ok: true };
    },
  },
  {
    id: "forbidden_report_time",
    message:
      "Tilos riportidő-ígéret (pl. „72 órán belül”, „72h”): ilyen nincs, a mérés eredménye valós idejű a helyszínen. Vedd ki az időígéretet.",
    appliesTo: isClaimCategory,
    check: (ctx) => {
      const m = ctx.body.match(REPORT_TIME_RE);
      return m ? { ok: false, excerpt: excerptAt(ctx.body, m.index ?? 0) } : { ok: true };
    },
  },
  {
    id: "forbidden_throughput",
    message:
      "Tilos m²/óra átereszőképesség-állítás (pl. „500 m²/óra”): nem publikus forrásból való. Vedd ki, vagy a „600 m² két óra alatt” engedélyezett formát használd, projektfüggő kitétellel.",
    appliesTo: isClaimCategory,
    check: (ctx) => {
      const m = ctx.body.match(THROUGHPUT_RE);
      return m ? { ok: false, excerpt: excerptAt(ctx.body, m.index ?? 0) } : { ok: true };
    },
  },
  {
    id: "forbidden_tolerance",
    message:
      "Tilos ± tűrésszám (pl. „±1 mm”, „plusz-mínusz 4 mm”): a FRAMEWORK csak a „milliméteres pontosság” kifejezést engedi, szám nélkül. Vedd ki a tűrésszámot.",
    appliesTo: isClaimCategory,
    check: (ctx) => {
      const m = ctx.body.match(TOLERANCE_RE);
      return m ? { ok: false, excerpt: excerptAt(ctx.body, m.index ?? 0) } : { ok: true };
    },
  },
  {
    id: "forbidden_xray",
    message:
      "Tilos röntgent/X-ray-t/átvilágítást a saját módszerünkként feltüntetni: nem sugárzással dolgozunk. Ha a mondat nem kifejezetten tagadja a sugárzás használatát, vedd ki vagy fogalmazd át tagadó formára.",
    appliesTo: isClaimCategory,
    check: (ctx) => {
      const sentences = ctx.body.split(/(?<=[.!?])\s+|\n+/);
      for (const sentence of sentences) {
        const m = sentence.match(XRAY_RE);
        if (m && !NEGATION_RE.test(sentence)) {
          return { ok: false, excerpt: sentence.trim().slice(0, 80) };
        }
      }
      return { ok: true };
    },
  },
  {
    id: "forbidden_reference",
    message:
      "Tilos vasúti/kikötői/kórházi referenciára hivatkozni: ilyen referenciánk nincs. Vedd ki, vagy csak olyan referenciát használj, amit ténylegesen elvégeztünk.",
    appliesTo: isClaimCategory,
    check: (ctx) => {
      const m = ctx.body.match(REFERENCE_RE);
      return m ? { ok: false, excerpt: excerptAt(ctx.body, m.index ?? 0) } : { ok: true };
    },
  },
  {
    id: "unfilled_placeholder",
    message:
      "Kitöltetlen helykitöltő maradt a szövegben (például <LEAD_MAGNET_URL> vagy TODO). Töltsd ki a hiányzó adatot, mielőtt beküldöd.",
    appliesTo: () => true,
    check: (ctx) => {
      const m = ctx.body.match(PLACEHOLDER_RE);
      return m ? { ok: false, excerpt: excerptAt(ctx.body, m.index ?? 0) } : { ok: true };
    },
  },
  {
    id: "missing_footer",
    message:
      "Hiányzik a leiratkozási lábléc a hideg e-mail végéről. Illeszd be a beállított láblécet.",
    /**
     * Only when a footer IS configured. A tenant without one is a SETTINGS
     * problem, not a copy problem: blocking here would make the rule unfixable
     * by any version, human or AI, and the item could never leave the queue
     * (Vanda, #104). Emission is still gated: sendDraft and the manual
     * "kézzel elküldve" both refuse while no footer is set.
     */
    appliesTo: (ctx) => isEmail(ctx) && ctx.requiresFooter === true && Boolean(ctx.footer?.trim()),
    check: (ctx) => {
      const footer = ctx.footer?.trim();
      if (!footer) return { ok: true };
      const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
      return normalize(ctx.body).includes(normalize(footer)) ? { ok: true } : { ok: false };
    },
  },
  {
    id: "body_too_long",
    message: `Az e-mail törzse túl hosszú (max ${BODY_MAX_CHARS_EMAIL} karakter). Rövidítsd: a valós hideg levelek 350-700 karakterek.`,
    appliesTo: isEmail,
    check: (ctx) => (ctx.body.length > BODY_MAX_CHARS_EMAIL ? { ok: false } : { ok: true }),
  },
  {
    id: "no_personal_hook",
    message:
      "Az e-mail eleje nem tartalmaz cégspecifikus apropót (nincs benne évszám, tulajdonnév vagy projektre utaló szó). Nyiss egy konkrét, a címzetthez köthető ténnyel.",
    appliesTo: isEmail,
    check: (ctx) => (hasHook(ctx.body) ? { ok: true } : { ok: false }),
  },
  {
    // DORMANT: ruleContextFor never sets recipientVerified, so this rule cannot
    // fire yet. It stays here (and stays tested) because the recipient list is
    // not in the CRM: it lives in recipients.csv, and the check only becomes
    // real once that list is imported and linked to the item. Until then a
    // human verifies the recipient before sending.
    id: "unverified_recipient",
    message:
      "A címzett nincs ellenőrizve (recipients.csv szerint verify_before_send). Ellenőrizd a címzettet küldés előtt.",
    appliesTo: isEmail,
    check: (ctx) => (ctx.recipientVerified === false ? { ok: false } : { ok: true }),
  },
  {
    id: "duplicate_hook",
    message:
      "Az e-mail nyitása gyakorlatilag megegyezik egy másik, ugyanabban a kampányban lévő levél nyitásával. Írj egyedi, a címzetthez köthető nyitást.",
    appliesTo: isEmail,
    check: (ctx) => {
      const hook = normalizeHook(ctx.body);
      const others = ctx.otherHooks ?? [];
      const dup = others.some((other) => similarity(hook, normalizeHook(other)) >= 0.9);
      return dup ? { ok: false, excerpt: hook.slice(0, 80) } : { ok: true };
    },
  },
];

export function runContentRules(ctx: RuleContext): RuleViolation[] {
  const violations: RuleViolation[] = [];
  for (const rule of CONTENT_RULES) {
    if (!rule.appliesTo(ctx)) continue;
    const result = rule.check(ctx);
    if (!result.ok) {
      violations.push({ rule: rule.id, message: rule.message, excerpt: result.excerpt });
    }
  }
  return violations;
}
