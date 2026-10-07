// Hungarian copy is PROPOSAL until Áron approves.
import { db } from "@/lib/db";
import { CATEGORY_LABEL } from "@/lib/content/labels";
import { getDecisionQueue, getInbox, type DecisionRow, type InboxRow } from "@/lib/content/queries";
import { STATUS_LABELS } from "@/lib/marketing/types";
import type { ContentCategory, ContentStatus } from "@/lib/content/types";

export type PageData = {
  userId: number;
  items: InboxRow[];
  decisions: (DecisionRow & { forWhom: "aron" | "peter" | "either"; deadline: string | null })[];
  now: Date;
  /** Queue capped or inbox has more pages. */
  truncated?: boolean;
  /** getInbox `mine` ids (includes rule-bounced items); absent in tests. */
  mineIds?: number[];
};

/** ~2K tokens: Groq free tier is 8K tokens per minute, shared with history and the reply. */
export const PAGE_CONTEXT_BUDGET_CHARS = 6000;

const DAY = 86_400_000;
const WHO = { aron: "Áron", peter: "Péter", either: "bárki" } as const;

/** User-provided strings are data inside <page>: strip page tags, flatten newlines. */
const clean = (s: string) => s.replace(/<\/?page\b[^>]*>/gi, "").replace(/\s*[\r\n]+\s*/g, " ").trim();

export function renderPageContext(input: PageData, opts: { budgetChars?: number } = {}): string {
  const budget = opts.budgetChars ?? PAGE_CONTEXT_BUDGET_CHARS;
  const { userId, now } = input;
  const age = (iso: string | null) => (iso ? Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY)) : 0);

  type Row = { kind: "i" | "d"; age: number; line: string };
  const rows: Row[] = [
    ...input.items.map((i): Row => {
      const a = age(i.waitingSince);
      const pending = i.verdicts.filter((v) => v.verdict === null).map((v) => clean(v.reviewerName)).join(", ") || "senki";
      return {
        kind: "i", age: a,
        line: `#${i.id} | ${clean(i.title)} | ${CATEGORY_LABEL[i.category as ContentCategory] ?? i.category} | ${STATUS_LABELS[i.status as ContentStatus] ?? i.status} | nyitott kérdések: ${i.openChecks} | még nem bírálta: ${pending} | kor: ${a} nap | link: /marketing/${i.id}`,
      };
    }),
    ...input.decisions.map((d): Row => ({
      kind: "d", age: d.daysWaiting,
      line: `kérdés #${d.checkId} | ${clean(d.question)} | kitől: ${WHO[d.forWhom]} | anyag: #${d.item.id} ${clean(d.item.title)} | vár: ${d.daysWaiting} nap | határidő: ${d.deadline ?? "nincs"} | link: /marketing/${d.item.id}`,
    })),
  ];

  const own = input.items
    .filter((i) => input.mineIds ? input.mineIds.includes(i.id) : (i.status === "in_review" || i.status === "draft") && i.verdicts.some((v) => v.reviewerId === userId && v.verdict === null))
    .map((i) => `#${i.id} ${clean(i.title)}`);
  const ownBlock = `ÖNRE VÁR:\n${own.length ? own.join("\n") : "(semmi)"}`;

  const render = (kept: Row[], dropped: number) => {
    const it = kept.filter((r) => r.kind === "i").map((r) => r.line);
    const de = kept.filter((r) => r.kind === "d").map((r) => r.line);
    const nItems = input.items.length;
    const nDec = input.decisions.length;
    const notes: string[] = [];
    if (dropped) notes.push(`FIGYELEM: a lista csonkolt, ${dropped} legrégebbi sor kimaradt.`);
    if (input.truncated) notes.push("FIGYELEM: több sor van, mint amennyi itt látszik (a lista nem teljes).");
    return [
      "<page>",
      `ANYAGOK (${nItems} db):`, ...(it.length ? it : ["(nincs)"]),
      `DÖNTÉSEK (${nDec} db):`, ...(de.length ? de : ["(nincs)"]),
      ownBlock, ...notes, "</page>",
    ].join("\n");
  };

  // Oldest first; pop from the front until under budget. ponytail: O(n^2) re-render, n is <= ~250.
  const sorted = [...rows].sort((a, b) => b.age - a.age);
  let dropped = 0;
  let text = render(sorted, 0);
  while (text.length > budget && dropped < sorted.length) {
    dropped++;
    text = render(sorted.slice(dropped), dropped);
  }
  return text;
}

export async function loadPageData(tenantId: number, userId: number, now = new Date()): Promise<PageData & { truncated: boolean; mineIds: number[] }> {
  const [inbox, queue] = await Promise.all([getInbox(tenantId, userId), getDecisionQueue(tenantId, now)]);
  const seen = new Set<number>();
  const items = [...inbox.mine, ...inbox.otherReviewer, ...inbox.aiWorking, ...inbox.changesRequested, ...inbox.live]
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  const flat = [
    ...queue.aron.map((d) => ({ ...d, forWhom: "aron" as const })),
    ...queue.peter.map((d) => ({ ...d, forWhom: "peter" as const })),
    ...queue.either.map((d) => ({ ...d, forWhom: "either" as const })),
  ];
  const ids = [...new Set(flat.map((d) => d.item.id))];
  const metas = ids.length
    ? await db.contentItem.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, sourceMeta: true } })
    : [];
  const deadlines = new Map<number, string>();
  for (const m of metas) {
    const dl = (m.sourceMeta as { deadline?: unknown } | null)?.deadline;
    if (typeof dl === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dl)) deadlines.set(m.id, dl);
  }
  return {
    userId, items, now, mineIds: inbox.mine.map((r) => r.id),
    decisions: flat.map((d) => ({ ...d, deadline: deadlines.get(d.item.id) ?? null })),
    truncated: queue.truncated || inbox.hasMore,
  };
}
