import { db } from "@/lib/db";
import { TIERS } from "./tier";
import { openCallTaskWhere } from "./board";
import { readDossier } from "@/lib/enrichment/dossier";

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

type CandidateRow = {
  id: number;
  tier: string | null;
  serviceInterest: string | null;
  message: string | null;
  receivedDate: Date | null;
  company: { name: string | null; city: string | null } | null;
  contact: { phone: string | null; person: { firstName: string | null; lastName: string | null; phone: string | null } | null } | null;
  tasks: { dueDate: Date | null }[];
};

export async function getDriveQueue(tenantId: number, limit = 25): Promise<DriveLead[]> {
  const now = new Date();

  const leadWhere = {
    tenantId,
    outcome: "open",
    convertedDealId: null,
    // company is a nullable relation — an inner-join-shaped filter here would
    // silently drop every lead with no company at all.
    OR: [{ companyId: null }, { company: { deletedAt: null } }] as Array<Record<string, unknown>>,
  };

  const select = {
    id: true,
    tier: true,
    serviceInterest: true,
    message: true,
    receivedDate: true,
    company: { select: { name: true, city: true } },
    contact: {
      select: {
        phone: true,
        person: { select: { firstName: true, lastName: true, phone: true } },
      },
    },
    tasks: {
      where: openCallTaskWhere(tenantId),
      orderBy: { dueDate: "asc" as const },
      take: 1,
      select: { dueDate: true },
    },
  };

  // ponytail: two bounded reads + sort in JS instead of one SQL ORDER BY that
  // expresses the whole ladder. ~400 rows total, cheap either way at this
  // scale; revisit past ~5k open leads.
  const [owed, byLadder] = await Promise.all([
    // (a) leads with an open call task already due — the promised callbacks.
    db.lead.findMany({
      where: { ...leadWhere, tasks: { some: { ...openCallTaskWhere(tenantId), dueDate: { lte: now } } } },
      orderBy: { receivedDate: "asc" },
      take: 100,
      select,
    }),
    // (b) tier A → E, oldest first — bounded so tier A can never fall off the end.
    db.lead.findMany({
      where: leadWhere,
      orderBy: [{ tier: { sort: "asc", nulls: "last" } }, { receivedDate: { sort: "asc", nulls: "last" } }],
      take: 300,
      select,
    }),
  ]);

  const byId = new Map<number, CandidateRow>();
  for (const row of [...owed, ...byLadder]) byId.set(row.id, row as CandidateRow);

  const mapped = [...byId.values()].map((lead) => {
    const due = lead.tasks[0]?.dueDate ?? null;
    return { lead, due, callbackDue: due !== null && due <= now };
  });

  mapped.sort((a, b) =>
    compareDriveCandidates(
      { callbackDue: a.callbackDue, dueAt: a.due, tier: a.lead.tier, receivedDate: a.lead.receivedDate },
      { callbackDue: b.callbackDue, dueAt: b.due, tier: b.lead.tier, receivedDate: b.lead.receivedDate },
    ),
  );

  const sliced = mapped.slice(0, limit);

  // Follow-up query, only for the leads that made the cut: the heavy company
  // dossier + latest interaction note.
  const ids = sliced.map((m) => m.lead.id);
  const extras = ids.length
    ? await db.lead.findMany({
        where: { tenantId, id: { in: ids } },
        select: {
          id: true,
          company: { select: { enrichment: true } },
          interactions: { orderBy: { occurredAt: "desc" }, take: 1, select: { notes: true } },
        },
      })
    : [];
  const extraById = new Map(extras.map((e) => [e.id, e]));

  return sliced.map(({ lead, due, callbackDue }) => {
    const p = lead.contact?.person;
    const extra = extraById.get(lead.id);
    return {
      id: lead.id,
      companyName: lead.company?.name ?? `Lead #${lead.id}`,
      personName: p ? `${p.lastName} ${p.firstName}`.trim() : null,
      // Companies carry no phone column — the number lives on the employment
      // (contact) or on the person.
      phone: lead.contact?.phone ?? p?.phone ?? null,
      city: lead.company?.city ?? null,
      tier: lead.tier,
      serviceInterest: lead.serviceInterest,
      message: lead.message,
      lastNote: extra?.interactions[0]?.notes ?? null,
      apropo: readDossier(extra?.company?.enrichment)?.apropo ?? [],
      callbackAt: callbackDue && due ? due.toISOString() : null,
    } satisfies DriveLead;
  });
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
