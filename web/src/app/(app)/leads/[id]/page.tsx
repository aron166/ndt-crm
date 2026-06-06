import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { serializeDates } from "@/lib/serialize";
import { getEntityHistory } from "@/app/actions/audit";
import { LeadDetailClient } from "./LeadDetailClient";

const TENANT_ID = 1;

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const leadId = parseInt(id, 10);
  if (isNaN(leadId)) notFound();

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

  const [interactions, auditEntries] = await Promise.all([
    db.interaction.findMany({
      where: {
        tenantId: TENANT_ID,
        OR: [
          ...(lead.companyId ? [{ companyId: lead.companyId }] : []),
          ...(personId ? [{ personId }] : []),
        ],
      },
      include: { person: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    getEntityHistory("lead", leadId),
  ]);

  return (
    <div className="mount">
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/leads"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-mute)" }}
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
      />
    </div>
  );
}
