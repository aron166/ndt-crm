import { db } from "@/lib/db";
import { SIDE_STAGES } from "@/lib/leads/lifecycle";
import { answersFrom } from "@/lib/leads/qualification";
import { fullName } from "@/lib/utils";

const TENANT_ID = 1;
const QUEUE_LIMIT = 200;

export type GroupKey = "overdue" | "today" | "tomorrow" | "later" | "none";

export interface QueueRow {
  id: number;
  name: string;
  personName: string | null;
  role: string | null;
  town: string | null;
  phone: string | null;
  tier: string | null;
  attempts: number;
  nextAction: string | null;
  nextDue: Date | null;
  status: string | null;
}

// PROPOSAL copy
export const GROUP_LABEL: Record<GroupKey, string> = {
  overdue: "Késésben", today: "Ma", tomorrow: "Holnap", later: "Később", none: "Nincs határidő",
};
const ORDER: GroupKey[] = ["overdue", "today", "tomorrow", "later", "none"];

/** Calendar day in Budapest as a day number (never the server timezone). */
export function budapestDay(d: Date): number {
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(d).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / 86_400_000);
}

export function groupKey(nextDue: Date | null, now: Date): GroupKey {
  if (!nextDue) return "none";
  if (nextDue.getTime() < now.getTime()) return "overdue";
  const diff = budapestDay(nextDue) - budapestDay(now);
  return diff <= 0 ? "today" : diff === 1 ? "tomorrow" : "later";
}

/** Pure: rows (already sorted) -> non-empty groups in urgency order. */
export function groupQueue<T extends { nextDue: Date | null }>(
  rows: T[], now: Date,
): { key: GroupKey; label: string; rows: T[] }[] {
  const by = new Map<GroupKey, T[]>();
  for (const r of rows) {
    const k = groupKey(r.nextDue, now);
    const arr = by.get(k);
    if (arr) arr.push(r); else by.set(k, [r]);
  }
  return ORDER.filter((k) => by.has(k)).map((k) => ({ key: k, label: GROUP_LABEL[k], rows: by.get(k)! }));
}

/** Pure: the one where shared by the queue rows and the queue total. null = everyone. */
export function queueWhere(assignedToId: number | null) {
  return {
    tenantId: TENANT_ID, outcome: "open", convertedDealId: null,
    OR: [{ status: null }, { status: { notIn: [...SIDE_STAGES] } }],
    ...(assignedToId != null ? { assignedToId } : {}),
  };
}

export function getQueueTotal(assignedToId: number | null) {
  return db.lead.count({ where: queueWhere(assignedToId) });
}

export async function getQueueRows(assignedToId: number | null): Promise<QueueRow[]> {
  const leads = await db.lead.findMany({
    where: queueWhere(assignedToId),
    select: {
      id: true, tier: true, attempts: true, nextAction: true, nextDue: true, status: true,
      subject: true, serviceInterest: true, qualification: true, customFields: true,
      company: { select: { name: true, city: true } },
      contact: {
        select: { phone: true, role: true, person: { select: { firstName: true, lastName: true, phone: true } } },
      },
    },
    orderBy: [{ nextDue: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: QUEUE_LIMIT,
  });
  return leads.map((l) => {
    const cf = (l.customFields ?? {}) as Record<string, unknown>;
    const p = l.contact?.person;
    const personName = p ? fullName(p.firstName, p.lastName) : (cf.contact_name as string | undefined) || null;
    const phone = l.contact?.phone ?? p?.phone ?? (cf.contact_phone as string | undefined) ?? null;
    return {
      id: l.id,
      name: l.company?.name || (personName && personName !== "-" ? personName : null) || l.subject || "Névtelen lead", // PROPOSAL copy
      personName: personName && personName !== "-" ? personName : null,
      role: l.contact?.role ?? null,
      town: answersFrom(l.qualification).location || l.company?.city || null,
      phone: phone || null,
      tier: l.tier, attempts: l.attempts ?? 0, nextAction: l.nextAction, nextDue: l.nextDue, status: l.status,
    };
  });
}

export async function getFooterCounts() {
  const [recall, lost] = await Promise.all([
    db.lead.count({ where: { tenantId: TENANT_ID, outcome: "open", convertedDealId: null, status: "recall" } }),
    db.lead.count({ where: { tenantId: TENANT_ID, outcome: "lost", convertedDealId: null } }),
  ]);
  return { recall, lost };
}
