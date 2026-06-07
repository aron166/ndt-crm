import type { Prisma } from "@prisma/client";
import type { LeadIntake } from "./schema";

// Transaction-agnostic lead ingestion (Platform Foundation #4).
//
// All writes go through the `tx` client passed in, so the caller controls the
// transaction boundary and this function stays unit-testable with a mock.
// Honours the non-negotiables: tenant scoping on every query, Person is the
// permanent entity (deduped by email), Contact is the time-bounded link,
// audit_log + app_events are append-only.

// The narrow slice of the Prisma client this needs. The real Prisma
// TransactionClient satisfies it structurally; tests pass a mock.
export interface LeadTx {
  company: {
    findFirst(args: Prisma.CompanyFindFirstArgs): Promise<{ id: number } | null>;
    create(args: Prisma.CompanyCreateArgs): Promise<{ id: number }>;
  };
  person: {
    findFirst(args: Prisma.PersonFindFirstArgs): Promise<{ id: number } | null>;
    create(args: Prisma.PersonCreateArgs): Promise<{ id: number }>;
  };
  contact: {
    findFirst(args: Prisma.ContactFindFirstArgs): Promise<{ id: number } | null>;
    create(args: Prisma.ContactCreateArgs): Promise<{ id: number }>;
  };
  lead: {
    create(args: Prisma.LeadCreateArgs): Promise<{ id: number }>;
  };
  leadStatus: {
    findFirst(args: Prisma.LeadStatusFindFirstArgs): Promise<{ key: string } | null>;
  };
  task: {
    create(args: Prisma.TaskCreateArgs): Promise<{ id: number }>;
  };
  auditLog: {
    create(args: Prisma.AuditLogCreateArgs): Promise<{ id: number }>;
  };
  appEvent: {
    create(args: Prisma.AppEventCreateArgs): Promise<{ id: number }>;
  };
}

export interface IngestCtx {
  tenantId: number;
  /** App slug from the authenticated key — the canonical source app. */
  appSlug: string;
}

export interface IngestResult {
  leadId: number;
  companyId: number;
  personId: number;
  /** True when an existing company was reused (deduped). */
  companyReused: boolean;
  /** True when an existing person was reused (deduped by email). */
  personReused: boolean;
}

function splitName(name: string | undefined, emailFallback?: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = (name ?? "").trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: "—" };
    // Hungarian convention elsewhere stores lastName first, but inbound web
    // forms are "First Last". Keep it simple and reversible: first token =
    // first name, remainder = last name.
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }
  const local = emailFallback?.split("@")[0];
  return { firstName: local || "Lead", lastName: "—" };
}

export async function ingestLead(
  input: LeadIntake,
  ctx: IngestCtx,
  tx: LeadTx,
): Promise<IngestResult> {
  const { tenantId } = ctx;
  // sourceApp is authoritative from the authenticated key — the payload's
  // source_app is deliberately ignored, so a key issued to app X can never
  // attribute a lead to app Y. (input.source_app is still preserved verbatim
  // inside the app_events payload below for raw-submission traceability.)
  const sourceApp = ctx.appSlug.trim();

  // 1. Dedupe Company by exact name (case-insensitive) within the tenant.
  const existingCompany = await tx.company.findFirst({
    where: { tenantId, name: { equals: input.company_name, mode: "insensitive" } },
    select: { id: true },
  });
  const companyReused = Boolean(existingCompany);
  const company =
    existingCompany ??
    (await tx.company.create({
      data: {
        tenantId,
        name: input.company_name,
        accountType: "Lead",
      },
      select: { id: true },
    }));

  // 2. Dedupe Person by email within the tenant (Person is the permanent entity).
  let person: { id: number } | null = null;
  if (input.contact_email) {
    person = await tx.person.findFirst({
      where: { tenantId, email: { equals: input.contact_email, mode: "insensitive" } },
      select: { id: true },
    });
  }
  const personReused = Boolean(person);
  if (!person) {
    const { firstName, lastName } = splitName(input.contact_name, input.contact_email);
    person = await tx.person.create({
      data: {
        tenantId,
        firstName,
        lastName,
        email: input.contact_email ?? null,
        phone: input.contact_phone ?? null,
      },
      select: { id: true },
    });
  }

  // 3. Ensure a current Contact linking person ↔ company (time-bounded state).
  let contact = await tx.contact.findFirst({
    where: { tenantId, personId: person.id, companyId: company.id, endedAt: null },
    select: { id: true },
  });
  if (!contact) {
    contact = await tx.contact.create({
      data: {
        tenantId,
        personId: person.id,
        companyId: company.id,
        email: input.contact_email ?? null,
        phone: input.contact_phone ?? null,
        startedAt: new Date(),
      },
      select: { id: true },
    });
  }

  // 4. Create the Lead at the tenant's INITIAL status (the configurable entry
  //    column of the lead pipeline; falls back to "new"). Marketing passthrough
  //    + contact snapshot live on custom_fields, mirroring the deals pattern.
  const initialStatus = await tx.leadStatus.findFirst({
    where: { tenantId, isInitial: true },
    orderBy: { position: "asc" },
  });
  const statusKey = initialStatus?.key ?? "new";

  const customFields: Record<string, unknown> = {};
  const passthrough: (keyof LeadIntake)[] = [
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "referrer", "landing_variant", "lead_score", "priority",
  ];
  for (const k of passthrough) {
    if (input[k] !== undefined && input[k] !== null) customFields[k] = input[k];
  }
  // Preserve the raw submitted contact details even after they're normalised
  // onto Person/Contact.
  if (input.contact_name) customFields.contact_name = input.contact_name;
  if (input.contact_email) customFields.contact_email = input.contact_email;
  if (input.contact_phone) customFields.contact_phone = input.contact_phone;

  const lead = await tx.lead.create({
    data: {
      tenantId,
      companyId: company.id,
      contactId: contact.id,
      source: input.source,
      sourceApp,
      status: statusKey,
      subject: input.service_interest ?? null,
      message: input.message ?? null,
      serviceInterest: input.service_interest ?? null,
      receivedDate: new Date(),
      ...(Object.keys(customFields).length > 0
        ? { customFields: customFields as Prisma.InputJsonValue }
        : {}),
    },
    select: { id: true },
  });

  // 5. Audit (append-only). Attributed to the source app, no user.
  await tx.auditLog.create({
    data: {
      tenantId,
      actorUserId: null,
      action: "create",
      entityType: "lead",
      entityId: lead.id,
      changes: {
        before: null,
        after: {
          companyId: company.id,
          personId: person.id,
          contactId: contact.id,
          source: input.source,
          sourceApp,
          status: statusKey,
        },
      } as Prisma.InputJsonValue,
    },
  });

  // 6. Emit an app_events row so the ecosystem hub sees the submission.
  await tx.appEvent.create({
    data: {
      tenantId,
      sourceApp,
      eventType: "lead.submitted",
      payload: input as unknown as Prisma.InputJsonValue,
      companyId: company.id,
      personId: person.id,
    },
  });

  // 7. Auto-task: a follow-up to contact the new lead, due tomorrow. This is the
  //    minimal seed of the planned task-automation rule engine ("when X happens
  //    → create task Y", user-configurable). The task tracks work against the
  //    permanent entities (company + person), not the lead card itself.
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 1);
  await tx.task.create({
    data: {
      tenantId,
      companyId: company.id,
      personId: person.id,
      title: `Lead megkeresése: ${input.company_name}`,
      type: "call",
      category: "revenue_generating",
      status: "created",
      dueDate,
      description: input.message
        ? `Új lead (${sourceApp}). Üzenet: ${input.message}`
        : `Új lead a(z) ${sourceApp} csatornán.`,
    },
  });

  return {
    leadId: lead.id,
    companyId: company.id,
    personId: person.id,
    companyReused,
    personReused,
  };
}
