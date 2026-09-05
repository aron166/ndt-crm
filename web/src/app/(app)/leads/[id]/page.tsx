import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { serializeDates } from "@/lib/serialize";
import { getEntityHistory } from "@/app/actions/audit";
import { getLeadStatuses } from "@/lib/leads/queries";
import { LeadDetailClient } from "./LeadDetailClient";

const TENANT_ID = 1;

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Reject anything that isn't purely digits before parseInt — "12abc",
  // "1e9", " 3 ", etc. must 404 rather than silently coerce to a valid id.
  if (!/^\d+$/.test(id)) notFound();
  const leadId = parseInt(id, 10);

  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId: TENANT_ID },
    include: {
      company: { select: { id: true, name: true, city: true, website: true } },
      contact: {
        select: {
          id: true, role: true, email: true, phone: true,
          person: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        },
      },
    },
  });
  if (!lead) notFound();

  const personId = lead.contact?.person?.id ?? null;

  const [interactions, auditEntries, statuses, users, openTasks] = await Promise.all([
    // Per-lead touches first-class (leadId), plus the person/company timeline
    // so older/company-level history still shows. Newest first, bounded.
    db.interaction.findMany({
      where: {
        tenantId: TENANT_ID,
        OR: [
          { leadId },
          ...(lead.companyId ? [{ companyId: lead.companyId }] : []),
          ...(personId ? [{ personId }] : []),
        ],
      },
      include: {
        person: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { name: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    getEntityHistory("lead", leadId),
    getLeadStatuses(TENANT_ID),
    db.user.findMany({ where: { tenantId: TENANT_ID }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.task.findMany({
      where: { tenantId: TENANT_ID, leadId, status: { in: ["created", "in_progress"] } },
      select: { id: true, title: true, dueDate: true, type: true, assignedTo: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
  ]);

  return (
    <div className="mount">
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/leads"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--fg-mute)" }}
          className="row-link"
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Vissza a leadekhez
        </Link>
      </div>

      <LeadDetailClient
        lead={serializeDates({
          ...lead,
          estimatedValue: lead.estimatedValue != null ? Number(lead.estimatedValue) : null,
          customFields: (lead.customFields ?? null) as Record<string, unknown> | null,
        })}
        interactions={serializeDates(interactions)}
        auditEntries={serializeDates(auditEntries)}
        statuses={statuses}
        users={users}
        openTasks={serializeDates(openTasks)}
      />
    </div>
  );
}
