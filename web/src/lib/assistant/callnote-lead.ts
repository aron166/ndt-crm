import { db } from "@/lib/db";

export type LeadResolution =
  | { ok: true; leadId: number }
  | { ok: false; status: 404 | 422; error: string; candidates: { lead_id: number; company: string | null }[] };

/**
 * Which lead a call note belongs to: lead_id if given (must be in the tenant), else the ONE
 * open lead whose company name equals `company` (case-insensitive). Zero or several matches
 * return 422 with up to 10 candidates by name containment, so the caller picks a lead_id.
 */
export async function resolveCallNoteLead(tenantId: number, leadId: number | null, company: string): Promise<LeadResolution> {
  if (leadId != null) {
    const lead = await db.lead.findFirst({ where: { id: leadId, tenantId }, select: { id: true } });
    return lead ? { ok: true, leadId: lead.id } : { ok: false, status: 404, error: "Lead not found", candidates: [] };
  }
  const name = company.trim();
  const select = { id: true, company: { select: { name: true } } } as const;
  const exact = name
    ? await db.lead.findMany({ where: { tenantId, outcome: "open", company: { name: { equals: name, mode: "insensitive" } } }, select, take: 10 })
    : [];
  if (exact.length === 1) return { ok: true, leadId: exact[0].id };
  const near = exact.length > 1
    ? exact
    : name
      ? await db.lead.findMany({ where: { tenantId, outcome: "open", company: { name: { contains: name, mode: "insensitive" } } }, select, take: 10 })
      : [];
  return {
    ok: false, status: 422,
    error: exact.length > 1 ? "Several open leads match this company; pass lead_id" : "No open lead matches this company; pass lead_id",
    candidates: near.map((l) => ({ lead_id: l.id, company: l.company?.name ?? null })),
  };
}
