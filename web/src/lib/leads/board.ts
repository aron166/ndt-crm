import { db } from "@/lib/db";

// Server-side per-lead extras for the board card + lead_idle: days since last
// contact and the next open callback. One groupBy per dimension (lead / company
// / person), never a query per card.

export interface LeadRef { id: number; companyId: number | null; personId: number | null; createdAt: Date }

export interface LeadExtras {
  lastContactAt: Date | null;
  callbackDueAt: Date | null;
}

export async function getLeadExtras(tenantId: number, leads: LeadRef[]): Promise<Map<number, LeadExtras>> {
  const out = new Map<number, LeadExtras>();
  if (leads.length === 0) return out;
  const leadIds = leads.map((l) => l.id);
  const companyIds = [...new Set(leads.map((l) => l.companyId).filter((x): x is number => x != null))];
  const personIds = [...new Set(leads.map((l) => l.personId).filter((x): x is number => x != null))];

  const [byLead, byCompany, byPerson, callbacks] = await Promise.all([
    db.interaction.groupBy({ by: ["leadId"], where: { tenantId, leadId: { in: leadIds } }, _max: { occurredAt: true } }),
    companyIds.length
      ? db.interaction.groupBy({ by: ["companyId"], where: { tenantId, companyId: { in: companyIds } }, _max: { occurredAt: true } })
      : [],
    personIds.length
      ? db.interaction.groupBy({ by: ["personId"], where: { tenantId, personId: { in: personIds } }, _max: { occurredAt: true } })
      : [],
    db.task.findMany({
      where: { tenantId, leadId: { in: leadIds }, type: "call", status: { in: ["created", "in_progress"] }, dueDate: { not: null } },
      select: { leadId: true, dueDate: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const leadMax = new Map(byLead.map((r) => [r.leadId, r._max.occurredAt]));
  const companyMax = new Map(byCompany.map((r) => [r.companyId, r._max.occurredAt]));
  const personMax = new Map(byPerson.map((r) => [r.personId, r._max.occurredAt]));
  const cb = new Map<number, Date>();
  for (const t of callbacks) if (t.leadId != null && t.dueDate && !cb.has(t.leadId)) cb.set(t.leadId, t.dueDate);

  for (const l of leads) {
    const candidates = [leadMax.get(l.id), l.companyId != null ? companyMax.get(l.companyId) : null, l.personId != null ? personMax.get(l.personId) : null]
      .filter((d): d is Date => d instanceof Date);
    const lastContactAt = candidates.length ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null;
    out.set(l.id, { lastContactAt, callbackDueAt: cb.get(l.id) ?? null });
  }
  return out;
}
