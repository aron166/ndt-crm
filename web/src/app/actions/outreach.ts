"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import {
  CALLABLE_STATUSES,
  nextStatusFor,
  outcomeMeta,
  isCallOutcome,
} from "@/lib/outreach/queue";
import { audienceWhere } from "@/lib/marketing/audience-query";
import type { Prisma } from "@prisma/client";

const TENANT_ID = 1;

// Companies the cockpit will call: callable status, alive, not under liquidation.
const CALLABLE_WHERE: Prisma.CompanyWhereInput = {
  tenantId: TENANT_ID,
  deletedAt: null,
  pipelineStatus: { in: [...CALLABLE_STATUSES] },
  NOT: { name: { contains: "F.A." } },
};

export interface CallCardContact {
  personId: number;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
}

export interface CallCardHistory {
  id: number;
  type: string | null;
  outcome: string | null;
  notes: string | null;
  occurredAt: string; // ISO
}

export interface CallCard {
  id: number;
  name: string;
  city: string | null;
  county: string | null;
  website: string | null;
  notes: string | null;
  pipelineStatus: string | null;
  lastInteractionDate: string | null; // ISO
  contacts: CallCardContact[]; // active contacts, primary first; pick which to call
  history: CallCardHistory[];
}

export interface CallSegment {
  id: number;
  name: string;
}

/** Company saved views, offered as ready-made calling rounds (marketing → calls). */
export async function getCallSegments(): Promise<CallSegment[]> {
  const views = await db.savedView.findMany({
    where: { tenantId: TENANT_ID, entityType: "company" },
    select: { id: true, name: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return views;
}

/**
 * The call queue: callable companies, coldest first (never-contacted lead). When
 * a segment (company SavedView) is given, intersect its audience with the
 * callable set — so a marketing segment becomes a calling round.
 */
export async function getCallQueue(viewId?: number | null): Promise<CallCard[]> {
  let where: Prisma.CompanyWhereInput = CALLABLE_WHERE;

  if (viewId) {
    const view = await db.savedView.findFirst({
      where: { id: viewId, tenantId: TENANT_ID, entityType: "company" },
      select: { filters: true },
    });
    if (view) {
      const resolved = await audienceWhere(view.filters, TENANT_ID);
      // Intersect the segment with the base callable/alive guardrails so a
      // segment can only ever NARROW the queue, never bypass the contract.
      where = { AND: [CALLABLE_WHERE, resolved] };
    }
  }

  const rows = await db.company.findMany({
    where,
    orderBy: [{ lastInteractionDate: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    take: 60,
    select: {
      id: true,
      name: true,
      city: true,
      county: true,
      website: true,
      notes: true,
      pipelineStatus: true,
      lastInteractionDate: true,
      contacts: {
        where: { endedAt: null },
        orderBy: [{ isPrimary: "desc" }, { startedAt: "desc" }],
        select: {
          role: true,
          phone: true,
          email: true,
          person: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
        },
      },
      interactions: {
        orderBy: { occurredAt: "desc" },
        take: 4,
        select: { id: true, type: true, outcome: true, notes: true, occurredAt: true },
      },
    },
  });

  return rows.map((c) => {
    const contacts: CallCardContact[] = c.contacts.map((ct) => ({
      personId: ct.person.id,
      name: `${ct.person.lastName} ${ct.person.firstName}`.trim(),
      role: ct.role,
      phone: ct.phone ?? ct.person.phone,
      email: ct.email ?? ct.person.email,
    }));
    return {
      id: c.id,
      name: c.name,
      city: c.city,
      county: c.county,
      website: c.website,
      notes: c.notes,
      pipelineStatus: c.pipelineStatus,
      lastInteractionDate: c.lastInteractionDate?.toISOString() ?? null,
      contacts,
      history: c.interactions.map((i) => ({
        id: i.id,
        type: i.type,
        outcome: i.outcome,
        notes: i.notes,
        occurredAt: i.occurredAt.toISOString(),
      })),
    };
  });
}

export interface RecordCallInput {
  companyId: number;
  personId?: number | null;
  outcome: string; // CALL_OUTCOMES key
  notes?: string;
  followupDate?: string | null; // yyyy-mm-dd → schedules a follow-up call task
}

export interface RecordCallResult {
  success: true;
  newStatus: string | null; // the status the company moved to, or null if unchanged
  taskCreated: boolean;
}

/**
 * Record one call outcome: append-only Interaction + pipeline-status transition +
 * optional follow-up task, atomically. This is the cockpit's single write — the
 * whole "log the call" action in one tap.
 */
export async function recordCall(
  input: RecordCallInput,
): Promise<RecordCallResult | { error: string }> {
  if (!isCallOutcome(input.outcome)) return { error: "Ismeretlen kimenetel" };

  const company = await db.company.findFirst({
    where: { id: input.companyId, tenantId: TENANT_ID, deletedAt: null },
    select: { id: true, name: true, pipelineStatus: true },
  });
  if (!company) return { error: "Cég nem található" };

  const meta = outcomeMeta(input.outcome)!;
  const newStatus = nextStatusFor(input.outcome, company.pipelineStatus);
  const personId = input.personId ?? null;
  // A quick outcome tap needn't carry a typed note — fall back to the label so the
  // append-only log still says what happened.
  const notes = input.notes?.trim() || meta.label;
  const now = new Date();

  const followupRaw = input.followupDate?.trim();
  const followupDate = followupRaw ? new Date(followupRaw) : null;
  if (followupDate && Number.isNaN(followupDate.getTime())) {
    return { error: "Érvénytelen visszahívási dátum" };
  }

  // Core write is atomic: the call log + the status/freshness move land together.
  const [interaction] = await db.$transaction([
    db.interaction.create({
      data: {
        tenantId: TENANT_ID,
        companyId: company.id,
        personId,
        type: "call",
        direction: "outbound",
        notes,
        outcome: meta.interactionOutcome,
        occurredAt: now,
      },
    }),
    db.company.update({
      where: { id: company.id },
      data: {
        lastInteractionDate: now,
        updatedAt: now,
        ...(newStatus !== null ? { pipelineStatus: newStatus } : {}),
      },
    }),
  ]);

  // Follow-up task is a convenience on top — created after the call is safely
  // logged so it can never roll back the interaction.
  const task = followupDate
    ? await db.task.create({
        data: {
          tenantId: TENANT_ID,
          companyId: company.id,
          personId,
          title: `Visszahívás: ${company.name}`,
          type: "call",
          category: "revenue_generating",
          status: "created",
          dueDate: followupDate,
        },
      })
    : null;

  await audit("interaction", interaction.id, "create", null, {
    type: "call",
    outcome: meta.interactionOutcome,
    companyId: company.id,
    personId,
  });
  if (newStatus !== null) {
    await audit(
      "company",
      company.id,
      "update",
      { pipelineStatus: company.pipelineStatus },
      { pipelineStatus: newStatus },
    );
  }
  if (task) {
    await audit("task", task.id, "create", null, {
      title: task.title,
      dueDate: followupDate?.toISOString() ?? null,
    });
  }

  revalidatePath("/calls");
  revalidatePath(`/companies/${company.id}`);
  return { success: true, newStatus, taskCreated: Boolean(task) };
}
