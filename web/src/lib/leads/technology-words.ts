import { db } from "@/lib/db";

export interface TechnologyWordCount {
  word: string;
  count: number;
  lastUsedAt: Date | null;
}

interface TechnologyWordRow {
  technologyWord: string | null;
  count: number;
  lastUsedAt: Date | null;
}

/**
 * Fold rows into one entry per word, case-insensitively. The DISPLAY spelling
 * is the most frequent original variant (ties broken by whichever was used
 * more recently). The customer's own wording varies in casing far more than
 * in substance, and forcing a single lowercase form would lose that.
 *
 * ponytail: folding in JS is fine while the distinct words stay in the dozens
 * (this is a small free-text field, not an open catalogue). If it ever grows
 * into the thousands, group with lower(technology_word) in SQL instead.
 */
export function foldTechnologyWords(rows: TechnologyWordRow[]): TechnologyWordCount[] {
  interface Bucket {
    count: number;
    lastUsedAt: Date | null;
    display: string;
    displayCount: number;
    displayLastUsedAt: Date | null;
  }
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    const word = row.technologyWord?.trim();
    if (!word) continue;
    const key = word.toLowerCase();
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        count: row.count,
        lastUsedAt: row.lastUsedAt,
        display: word,
        displayCount: row.count,
        displayLastUsedAt: row.lastUsedAt,
      });
      continue;
    }
    existing.count += row.count;
    if (!existing.lastUsedAt || (row.lastUsedAt && row.lastUsedAt > existing.lastUsedAt)) {
      existing.lastUsedAt = row.lastUsedAt;
    }
    // Most frequent spelling wins the display slot; a tie goes to whichever
    // variant was used more recently.
    const morePopular = row.count > existing.displayCount;
    const tiedButNewer = row.count === existing.displayCount
      && row.lastUsedAt && (!existing.displayLastUsedAt || row.lastUsedAt > existing.displayLastUsedAt);
    if (morePopular || tiedButNewer) {
      existing.display = word;
      existing.displayCount = row.count;
      existing.displayLastUsedAt = row.lastUsedAt;
    }
  }

  return [...buckets.values()]
    .map((b) => ({ word: b.display, count: b.count, lastUsedAt: b.lastUsedAt }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

/**
 * Counts of the customer's own words for the technology, over the last `days`.
 * Free text (see lib/leads/outcomes.ts `technologyWord`) and case folded here,
 * never validated against a known list.
 */
export async function getTechnologyWordCounts(tenantId: number, days = 365): Promise<TechnologyWordCount[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const groups = await db.interaction.groupBy({
    by: ["technologyWord"],
    where: {
      tenantId,
      technologyWord: { not: null },
      occurredAt: { gte: since },
      // A correction writes a NEW interaction that supersedes the old one
      // (interactions are append-only, decisions.md #2). CallOutcomeModal
      // never re-prompts for the word in correction mode, so correctCallOutcome
      // carries it forward from the superseded row onto the new one. Counting
      // both here would double it. getScriptStats does not do this yet, which
      // is a pre-existing overcount in the A/B table, not something this
      // change introduces.
      supersededBy: { none: {} },
    },
    _count: true,
    _max: { occurredAt: true },
  });
  return foldTechnologyWords(groups.map((g) => ({
    technologyWord: g.technologyWord,
    count: g._count,
    lastUsedAt: g._max.occurredAt,
  })));
}
