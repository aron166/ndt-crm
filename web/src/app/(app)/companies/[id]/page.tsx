import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CompanyDetailClient } from "./CompanyDetailClient";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";
import { getTagsForEntity } from "@/app/actions/tags";
import { getEntityHistory } from "@/app/actions/audit";
import { getCompanyAttributes } from "@/app/actions/company-attributes";
import { serializeDates } from "@/lib/serialize";
import { isConnected } from "@/lib/integrations/google_maps";

const TENANT_ID = 1;

const AVATAR_PALETTE = [
  "oklch(0.66 0.19 278)", "oklch(0.80 0.13 165)", "oklch(0.80 0.15 75)",
  "oklch(0.78 0.12 230)", "oklch(0.72 0.16 305)", "oklch(0.72 0.18 25)",
];

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (isNaN(companyId)) notFound();

  const [company, contacts, interactions, tasks, invoices, appEvents, initialTags, auditEntries, attributes] = await Promise.all([
    db.company.findFirst({ where: { id: companyId, tenantId: TENANT_ID } }),
    db.contact.findMany({
      where: { companyId, tenantId: TENANT_ID },
      include: { person: true },
      orderBy: [{ endedAt: "asc" }, { startedAt: "desc" }],
    }),
    db.interaction.findMany({
      where: { companyId, tenantId: TENANT_ID },
      include: { person: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    db.task.findMany({
      where: { companyId, tenantId: TENANT_ID, parentTaskId: null },
      include: { _count: { select: { subTasks: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
    db.invoice.findMany({
      where: { companyId, tenantId: TENANT_ID },
      select: { netAmount: true, issuedDate: true },
      orderBy: { issuedDate: "asc" },
      take: 24,
    }),
    db.appEvent.findMany({
      where: { companyId, tenantId: TENANT_ID },
      include: { agent: { select: { id: true, name: true, owner: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    getTagsForEntity("company", companyId),
    getEntityHistory("company", companyId),
    getCompanyAttributes(companyId),
  ]);

  if (!company) notFound();

  // Revenue sparkline — real invoice amounts only, no fabrication
  const revenueSeries = invoices
    .filter((inv) => inv.netAmount != null)
    .map((inv) => Number(inv.netAmount));

  // Engagement breakdown by type
  const typeCounts: Record<string, number> = {};
  for (const i of interactions) {
    const t = i.type ?? "note";
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }
  const engagementBreakdown = [
    { label: "Hívás",              value: typeCounts.call       ?? 0, color: "var(--mint)"   },
    { label: "Email",              value: typeCounts.email      ?? 0, color: "var(--sky)"    },
    { label: "Találkozó",         value: typeCounts.meeting    ?? 0, color: "var(--violet)" },
    { label: "Helyszíni látogatás",value: typeCounts.site_visit ?? 0, color: "var(--amber)"  },
  ].filter((s) => s.value > 0);
  if (!engagementBreakdown.length) {
    engagementBreakdown.push({ label: "Nincs adat", value: 1, color: "var(--bg-3)" });
  }

  // KPI strip
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled").length;
  const kpis = [
    { label: "Számlák",         value: invoices.length,                   accent: "var(--mint)"   },
    { label: "Kapcsolatok",     value: contacts.filter(c => !c.endedAt).length, accent: "var(--indigo)" },
    { label: "Nyitott feladatok", value: openTasks,                       accent: "var(--amber)"  },
    { label: "Interakciók",     value: interactions.length,               accent: "var(--sky)"    },
  ];

  const avatarColor = AVATAR_PALETTE[companyId % AVATAR_PALETTE.length];
  const initials = company.name.slice(0, 3).toUpperCase();
  const mapsConnected = await isConnected();

  return (
    <div className="mount">
      {/* Back + pipeline badge row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <Link
          href="/companies"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-mute)" }}
          className="row-link"
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Vissza a cégekhez
        </Link>
        <PipelineStatusBadge status={company.pipelineStatus} />
      </div>

      <CompanyDetailClient
        company={serializeDates(company)}
        contacts={serializeDates(contacts)}
        interactions={serializeDates(interactions)}
        tasks={serializeDates(tasks)}
        appEvents={serializeDates(appEvents)}
        mapsConnected={mapsConnected}
        revenueSeries={revenueSeries}
        engagementBreakdown={engagementBreakdown}
        kpis={kpis}
        avatarColor={avatarColor}
        initials={initials}
        initialTags={initialTags}
        auditEntries={serializeDates(auditEntries)}
        attributes={serializeDates(attributes)}
      />
    </div>
  );
}
