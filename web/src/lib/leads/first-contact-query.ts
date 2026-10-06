import { db } from "@/lib/db";
import { FIRST_CONTACT_TYPES, firstContactFor } from "./first-contact";

/** Earliest real contact (not a note) per lead; same leadId/company/person matching as the board's lastContactAt. One query. */
export async function firstContactByLead(
  tenantId: number,
  leads: { id: number; companyId: number | null; personId: number | null; createdAt: Date }[],
): Promise<Map<number, Date>> {
  const out = new Map<number, Date>();
  if (leads.length === 0) return out;
  const companyIds = [...new Set(leads.map((l) => l.companyId).filter((x): x is number => x != null))];
  const personIds = [...new Set(leads.map((l) => l.personId).filter((x): x is number => x != null))];
  const rows = await db.interaction.findMany({
    where: {
      tenantId,
      type: { in: FIRST_CONTACT_TYPES },
      occurredAt: { gte: new Date(Math.min(...leads.map((l) => l.createdAt.getTime()))) },
      OR: [
        { leadId: { in: leads.map((l) => l.id) } },
        ...(companyIds.length ? [{ companyId: { in: companyIds } }] : []),
        ...(personIds.length ? [{ personId: { in: personIds } }] : []),
      ],
    },
    select: { leadId: true, companyId: true, personId: true, occurredAt: true },
  });
  for (const l of leads) {
    const d = firstContactFor(l, rows);
    if (d) out.set(l.id, d);
  }
  return out;
}
