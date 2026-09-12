import { z } from "zod";

/**
 * Call-script variants — the A/B gate on "a manual stage is only ready to hand
 * to an agent once it is measurable" (BACKLOG 2026-09-12 item 1).
 *
 * Same split as the qualification questions (decisions #17): the VARIANTS are
 * tenant config (`tenants.settings.scriptVariants`), while what a call actually
 * used is stamped on the interaction row (`interactions.script_variant`). So
 * re-wording a script keeps its history, and deleting one does not erase the
 * calls that were made with it — the stats just show a key with no label.
 *
 * PURE module: no DB import, so the setup editor, the call modal, /drive and
 * the API all share one definition.
 */

export const SCRIPT_KEY_MAX = 40;
export const SCRIPT_LABEL_MAX = 120;
export const SCRIPT_BODY_MAX = 8000;
/** Péter's range: 3-5 variants. One is allowed (no A/B yet), more than 5 is noise. */
export const SCRIPT_VARIANT_MAX = 5;

export interface ScriptVariant {
  key: string;
  label: string;
  body: string;
}

export const scriptVariantSchema = z.object({
  key: z.string().trim().min(1).max(SCRIPT_KEY_MAX).regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(1).max(SCRIPT_LABEL_MAX),
  body: z.string().trim().max(SCRIPT_BODY_MAX),
});

/**
 * ⚠️ PLACEHOLDERS. Péter and Áron write the real scripts; every line is marked
 * so nobody reads one of these to a customer by accident. Same convention as
 * the stage descriptions from PR #76.
 */
export const DEFAULT_SCRIPT_VARIANTS: ScriptVariant[] = [
  {
    key: "a",
    label: "TODO — A változat (kérdéssel nyit)",
    body: "TODO — ide jön az A szkript szövege. Nyitás egy kérdéssel: van-e most futó projekt, ahol meglévő betonba kell fúrni vagy vágni?",
  },
  {
    key: "b",
    label: "TODO — B változat (esettel nyit)",
    body: "TODO — ide jön a B szkript szövege. Nyitás egy referenciával, utána ugyanaz a kérdés.",
  },
];

/** Read the variants out of an unvalidated settings blob; never throw. */
export function scriptVariantsFromSettings(settings: unknown): ScriptVariant[] {
  const raw = (settings as { scriptVariants?: unknown } | null)?.scriptVariants;
  const parsed = z.array(scriptVariantSchema).min(1).max(SCRIPT_VARIANT_MAX).safeParse(raw);
  if (!parsed.success) return DEFAULT_SCRIPT_VARIANTS;
  // Duplicate keys would merge each other's stats.
  const seen = new Set<string>();
  const unique = parsed.data.filter((v) => !seen.has(v.key) && seen.add(v.key));
  return unique.length > 0 ? unique : DEFAULT_SCRIPT_VARIANTS;
}

export function slugifyScriptKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, SCRIPT_KEY_MAX);
}

/**
 * Parse the /leads/setup editor. One block per variant, blocks separated by a
 * line of `---`; the block's FIRST line MUST be `key|label` (explicit key,
 * required — see below), the rest is the script body.
 *
 * The key is explicit on purpose: it is what lands on every interaction row, so
 * re-wording a label must not silently start a new statistics bucket. Requiring
 * `|` on every head line also catches the case where a `---` line INSIDE a
 * script body would otherwise silently split it into a phantom variant — a body
 * line never contains `|<rest>` that looks like a key by accident as easily as
 * it collides with a bare `---`, so this turns that mistake into an error
 * instead of a silent data-losing split.
 */
export function parseScriptBlocks(text: string): ScriptVariant[] | { error: string } {
  const out: ScriptVariant[] = [];
  const seen = new Set<string>();

  for (const block of text.split(/^\s*---\s*$/m)) {
    const lines = block.split("\n");
    const headIndex = lines.findIndex((l) => l.trim() !== "");
    if (headIndex === -1) continue; // blank block between separators

    const head = lines[headIndex].trim();
    const sep = head.indexOf("|");
    if (sep < 0) {
      return {
        error: `Hiányzik az "azonosító|név" az alábbi sorból: "${head}". `
          + `Ha ez egy szkript szövegén belüli rész, valószínűleg egy önálló "---" sor `
          + `véletlenül kettévágta a szkriptet — a "---" csak szkriptek KÖZÖTT megengedett.`,
      };
    }
    const label = head.slice(sep + 1).trim();
    const key = slugifyScriptKey(head.slice(0, sep));
    const body = lines.slice(headIndex + 1).join("\n").trim();

    if (!label) return { error: "Üres szkriptnév" };
    if (!key) return { error: `A szkript azonosítója üres lenne: "${label}"` };
    if (label.length > SCRIPT_LABEL_MAX) return { error: `A szkript neve túl hosszú (max ${SCRIPT_LABEL_MAX} karakter)` };
    if (body.length > SCRIPT_BODY_MAX) return { error: `A(z) "${label}" szkript szövege túl hosszú (max ${SCRIPT_BODY_MAX} karakter)` };
    if (seen.has(key)) return { error: `Két szkript azonos azonosítót kapna: ${key}` };
    seen.add(key);
    out.push({ key, label, body });
  }

  if (out.length === 0) return { error: "Legalább egy szkriptváltozat kell" };
  if (out.length > SCRIPT_VARIANT_MAX) return { error: `Legfeljebb ${SCRIPT_VARIANT_MAX} szkriptváltozat lehet` };
  return out;
}

/** Render the variants back into the editor's block format. */
export function formatScriptBlocks(variants: ScriptVariant[]): string {
  return variants.map((v) => `${v.key}|${v.label}\n${v.body}`).join("\n---\n");
}
