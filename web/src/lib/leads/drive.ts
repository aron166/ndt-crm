import { db } from "@/lib/db";
import { TIERS } from "./tier";

// The /drive queue: which lead to call next, in the car, one screen.
//
// Priority ladder (Péter's, addendum item 4): a promised callback that is due
// beats everything — we said we would ring back, and a missed callback is the
// one thing that kills the relationship. Then tier A → E, then oldest first so
// nothing rots at the bottom of the list.

export interface DriveLead {
  id: number;
  companyName: string;
  personName: string | null;
  phone: string | null;
  city: string | null;
  tier: string | null;
  status: string | null;
  serviceInterest: string | null;
  message: string | null;
  /** The last note logged on this lead, so the caller opens with context. */
  lastNote: string | null;
  /** The three apropó lines from the company dossier, when research wrote one. */
  apropo: string[];
  /** Due callback, if this lead is one — drives the ordering and the badge. */
  callbackAt: string | null;
}

const TIER_RANK = new Map<string, number>(TIERS.map((t, i) => [t, i]));
// An untiered lead sorts after every tiered one, before nothing.
const UNTIERED_RANK = TIERS.length;

/** Newest-first apropó lines out of a company's dossier JSON, defensively. */
function readApropo(enrichment: unknown): string[] {
  if (!enrichment || typeof enrichment !== "object") return [];
  const value = (enrichment as { apropo?: unknown }).apropo;
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").slice(0, 3);
}

export async function getDriveQueue(tenantId: number, limit = 25): Promise<DriveLead[]> {
  const now = new Date();

  // ponytail: one bounded read + sort in JS. The ladder mixes a task due-date,
  // a tier letter and an age; expressing that as SQL ORDER BY costs more than
  // it saves at a few hundred open leads. Revisit past ~5k.
  const rows = await db.lead.findMany({
    where: {
      tenantId,
      outcome: "open",
      convertedDealId: null,
      company: { deletedAt: null },
    },
    orderBy: { receivedDate: { sort: "asc", nulls: "last" } },
    take: 300,
    select: {
      id: true,
      tier: true,
      status: true,
      serviceInterest: true,
      message: true,
      receivedDate: true,
      company: { select: { name: true, city: true, enrichment: true } },
      contact: {
        select: {
          phone: true,
          person: { select: { firstName: true, lastName: true, phone: true } },
        },
      },
      tasks: {
        where: { type: "call", status: { in: ["created", "not_started", "in_progress"] } },
        orderBy: { dueDate: "asc" },
        take: 1,
        select: { dueDate: true },
      },
      interactions: {
        orderBy: { occurredAt: "desc" },
        take: 1,
        select: { notes: true },
      },
    },
  });

  const mapped = rows.map((lead) => {
    const due = lead.tasks[0]?.dueDate ?? null;
    const p = lead.contact?.person;
    return {
      // Only a callback that has come DUE jumps the queue; one scheduled for
      // Thursday is not more urgent than a tier-A lead we have never rung.
      callbackDue: due !== null && due <= now,
      dueAt: due,
      tier: lead.tier,
      receivedDate: lead.receivedDate,
      card: {
        id: lead.id,
        companyName: lead.company?.name ?? `Lead #${lead.id}`,
        personName: p ? `${p.lastName} ${p.firstName}`.trim() : null,
        // Companies carry no phone column — the number lives on the employment
        // (contact) or on the person.
        phone: lead.contact?.phone ?? p?.phone ?? null,
        city: lead.company?.city ?? null,
        tier: lead.tier,
        status: lead.status,
        serviceInterest: lead.serviceInterest,
        message: lead.message,
        lastNote: lead.interactions[0]?.notes ?? null,
        apropo: readApropo(lead.company?.enrichment),
        callbackAt: due !== null && due <= now ? due.toISOString() : null,
      } satisfies DriveLead,
    };
  });

  mapped.sort(compareDriveCandidates);

  return mapped.slice(0, limit).map((m) => m.card);
}

/** The ladder itself, pure and exported so it can be tested without a DB. */
export interface DriveCandidate {
  callbackDue: boolean;
  dueAt: Date | null;
  tier: string | null;
  receivedDate: Date | null;
}

export function compareDriveCandidates(a: DriveCandidate, b: DriveCandidate): number {
  // 1. a callback we promised and already owe
  if (a.callbackDue !== b.callbackDue) return a.callbackDue ? -1 : 1;
  // 2. among those, the longest overdue
  if (a.callbackDue && b.callbackDue) {
    return (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0);
  }
  // 3. tier A → E, untiered last
  const ta = TIER_RANK.get(a.tier ?? "") ?? UNTIERED_RANK;
  const tb = TIER_RANK.get(b.tier ?? "") ?? UNTIERED_RANK;
  if (ta !== tb) return ta - tb;
  // 4. oldest first, so nothing rots at the bottom
  const ra = a.receivedDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rb = b.receivedDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return ra - rb;
}
