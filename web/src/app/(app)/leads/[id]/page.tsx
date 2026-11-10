import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { serializeDates } from "@/lib/serialize";
import { getEntityHistory } from "@/app/actions/audit";
import { getLeadStatuses, getQuestionModel, getScriptVariants } from "@/lib/leads/queries";
import { answersFrom, answerSourcesFrom } from "@/lib/leads/qualification";
import { firstContactByLead } from "@/lib/leads/first-contact-query";
import { minutesToFirstContact } from "@/lib/leads/first-contact";
import { INTENT_LABEL, callWindowLabel } from "@/lib/leads/intake-notify";
import { LeadOffersPanel } from "./LeadOffersPanel";
import { LeadDetailClient } from "./LeadDetailClient";
import { BookingPanel } from "./booking/BookingPanel";
import s from "./detail/lead.module.css";

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

  const [interactions, auditEntries, statuses, users, openTasks, questionModel, scriptVariants, callTypeGroups, offers, documents] = await Promise.all([
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
      select: {
        id: true, type: true, direction: true, outcome: true, notes: true,
        occurredAt: true, leadId: true, autoConfidence: true, supersedesInteractionId: true,
        person: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { name: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    getEntityHistory("lead", leadId),
    getLeadStatuses(TENANT_ID),
    // A lead already owned by a @system user keeps that owner in the select.
    db.user.findMany({ where: { tenantId: TENANT_ID, OR: [{ email: { not: { endsWith: "@system" } } }, { assignedLeads: { some: { id: leadId, tenantId: TENANT_ID } } }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.task.findMany({
      where: { tenantId: TENANT_ID, leadId, status: { in: ["created", "in_progress"] } },
      select: { id: true, title: true, dueDate: true, type: true, assignedTo: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
    getQuestionModel(TENANT_ID),
    getScriptVariants(TENANT_ID),
    db.interaction.groupBy({
      by: ["callType"],
      where: { tenantId: TENANT_ID, leadId, type: "call", supersededBy: { none: {} } },
      _count: { _all: true },
    }),
    db.quote.findMany({
      where: { tenantId: TENANT_ID, leadId, template: { not: null } },
      select: { id: true, quoteNumber: true, template: true, status: true, createdAt: true, sentAt: true, acceptedAt: true },
      orderBy: { createdAt: "desc" },
    }),
    db.leadDocument.findMany({
      where: { tenantId: TENANT_ID, leadId },
      orderBy: { createdAt: "desc" },
      select: { id: true, kind: true, number: true, createdAt: true },
    }),
  ]);

  const firstContactMin = minutesToFirstContact(
    lead.createdAt,
    (await firstContactByLead(TENANT_ID, [{ id: leadId, companyId: lead.companyId, personId, createdAt: lead.createdAt }])).get(leadId) ?? null,
  );

  const qa = answersFrom(lead.qualification);
  const cf = (lead.customFields ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const callWindow = str(qa.call_window) ?? str(cf.call_window);
  const town = str(qa.location);
  // PROPOSAL copy: the key-fact captions. Only facts that are present are listed.
  const keyFacts = [
    lead.intent ? { label: "Szándék", value: INTENT_LABEL[lead.intent] ?? lead.intent } : null,
    lead.buyerType ? { label: "Ügyfél", value: lead.buyerType === "company" ? "cég" : lead.buyerType === "private" ? "magánszemély" : lead.buyerType } : null,
    callWindow ? { label: "Hívható", value: callWindowLabel(callWindow) } : null,
    town ? { label: "Település", value: town } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <div className="mount">
      <Link href="/leads" className={s.back}>
        <ArrowLeft size={14} />
        {/* PROPOSAL copy */}
        Vissza a mai hívólistára
      </Link>

      <LeadDetailClient
        key={leadId}
        keyFacts={keyFacts}
        firstContactMin={firstContactMin}
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
        questions={questionModel.questions}
        questionSets={questionModel.sets}
        qualification={answersFrom(lead.qualification)}
        answerSources={answerSourcesFrom(lead.answerSources)}
        scriptVariants={scriptVariants}
        callTypeCounts={callTypeGroups.map((g) => ({ callType: g.callType, count: g._count._all }))}
        // The booking API refuses a lead that is not open (409), so a closed lead gets the note, not the search.
        bookingPanel={<BookingPanel key={leadId} leadId={leadId} leadOpen={lead.outcome === "open" && lead.convertedDealId == null} />}
        offersPanel={<LeadOffersPanel leadId={leadId} offers={serializeDates(offers)} documents={serializeDates(documents)} status={lead.status} />}
      />
    </div>
  );
}
