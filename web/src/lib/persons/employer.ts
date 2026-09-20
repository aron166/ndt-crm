// Single source of truth for "which employer do we show for this person".
// Contact rows are the history (Person is permanent, Contact is a time-bounded
// person-at-company row); this module answers the one question every display
// surface (search results, the persons list, the person detail page) needs:
// is there an open contact, and if not, what is the most recent one, if any.
// Keeping the rule here means the three call sites cannot quietly drift apart
// on how they pick "the" employer out of a person's contact history.

export type EmployerState =
  | { kind: "current"; companyId: number; companyName: string; role: string | null }
  | { kind: "former";  companyId: number; companyName: string; role: string | null; endedAt: Date }
  | { kind: "unknown" };

// Structural and permissive on purpose: every call site has its own Prisma
// select shape for a contact row, and none of them should have to map into a
// bespoke type just to call this function.
export interface EmployerContact {
  companyId: number;
  role: string | null;
  startedAt: Date | string | null;
  endedAt: Date | string | null;
  company: { name: string };
}

function toDate(d: Date | string | null): Date | null {
  if (d == null) return null;
  return d instanceof Date ? d : new Date(d);
}

// null startedAt sorts oldest, so a contact with no recorded start date never
// wins a "latest" comparison against one that has a real date.
const EPOCH = new Date(0);

export function employerState(contacts: readonly EmployerContact[]): EmployerState {
  const open = contacts.filter((c) => c.endedAt == null);
  if (open.length > 0) {
    const latest = open.reduce((best, c) =>
      (toDate(c.startedAt) ?? EPOCH) > (toDate(best.startedAt) ?? EPOCH) ? c : best
    );
    return { kind: "current", companyId: latest.companyId, companyName: latest.company.name, role: latest.role };
  }

  if (contacts.length > 0) {
    const latest = contacts.reduce((best, c) =>
      (toDate(c.endedAt) ?? EPOCH) > (toDate(best.endedAt) ?? EPOCH) ? c : best
    );
    // Every contact here failed the `endedAt == null` filter above, so
    // toDate(latest.endedAt) is never null - the `?? EPOCH` above is only to
    // satisfy the comparison, this fallback is unreachable in practice.
    return {
      kind: "former",
      companyId: latest.companyId,
      companyName: latest.company.name,
      role: latest.role,
      endedAt: toDate(latest.endedAt) ?? EPOCH,
    };
  }

  return { kind: "unknown" };
}

/** PROPOSAL (unreviewed Hungarian) */
export function employerLabel(s: EmployerState): string {
  switch (s.kind) {
    case "current": return s.companyName;
    case "former":  return `Volt: ${s.companyName}`;
    case "unknown": return "Munkahely ismeretlen";
  }
}
