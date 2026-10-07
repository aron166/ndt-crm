// Hungarian copy is PROPOSAL until Áron approves.
import { db } from "@/lib/db";
import { getDecisionQueue, getInbox, type DecisionRow, type InboxRow } from "@/lib/content/queries";

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
