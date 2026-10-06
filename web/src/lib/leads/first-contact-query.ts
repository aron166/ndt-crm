import { db } from "@/lib/db";
import { FIRST_CONTACT_TYPES } from "./first-contact";

/** Earliest real contact (not a note) per lead, one query for all ids. */
export async function firstContactByLead(tenantId: number, leadIds: number[]): Promise<Map<number, Date>> {
  if (leadIds.length === 0) return new Map();
  const rows = await db.interaction.groupBy({
    by: ["leadId"],
    where: { tenantId, leadId: { in: leadIds }, type: { in: FIRST_CONTACT_TYPES } },
    _min: { occurredAt: true },
  });
  const out = new Map<number, Date>();
  for (const r of rows) if (r.leadId != null && r._min.occurredAt) out.set(r.leadId, r._min.occurredAt);
  return out;
}
