"use server";

import { db } from "@/lib/db";
import { NOT_FA } from "@/lib/companies/filters";
import { requireCrmUser, userLeadCtx } from "@/lib/actor";
import { completeOpenLeadCallTasks } from "@/lib/leads/service";
import { advanceMembersForCall, findCallableMembers, recordOutcome } from "@/lib/campaigns/service";
import type { CallOutcomeKey as CampaignCallOutcomeKey } from "@/lib/campaigns/rules";
import { loadSuppressionSet, isSuppressed } from "@/lib/suppression";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import {
  CALLABLE_STATUSES,
  nextStatusFor,
  outcomeMeta,
  isCallOutcome,
} from "@/lib/outreach/queue";
import { audienceWhere } from "@/lib/marketing/audience-query";
import { recomputeCloseness } from "@/lib/enrichment/recompute";
import type { Prisma } from "@prisma/client";

const TENANT_ID = 1;

// Companies the cockpit will call: callable status, alive, not under liquidation.
const CALLABLE_WHERE: Prisma.CompanyWhereInput = {
  tenantId: TENANT_ID,
  deletedAt: null,
  pipelineStatus: { in: [...CALLABLE_STATUSES] },
  AND: [NOT_FA],
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
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) throw new Error(denied);
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
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) throw new Error(denied);
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

  const suppressed = await loadSuppressionSet(TENANT_ID);
  return rows.map((c) => {
    const contacts: CallCardContact[] = c.contacts
      .filter((ct) => !isSuppressed(ct.email ?? ct.person.email, suppressed) && !isSuppressed(ct.person.email, suppressed))
      .map((ct) => ({
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

/**
 * Announce a call to the external pipeline (Make webhook). The CRM's outbound
 * half of the call loop: POST the call-started event to CALL_WEBHOOK_URL so the
 * Make scenario can dial the phone (Tasker) + start recording. Returns a callId
 * the caller can thread through to correlate the later transcript result.
 */
export interface CallStartInput {
  companyId: number;
  personId?: number | null;
  contactName?: string | null;
  phone?: string | null;
}

export async function startCall(
  input: CallStartInput,
): Promise<{ callId: string } | { error: string }> {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) return { error: denied };
  const url = process.env.CALL_WEBHOOK_URL;
  if (!url) return { error: "Hívás webhook nincs beállítva (CALL_WEBHOOK_URL)" };

  // Scope the company to the tenant before announcing a call for it.
  const company = await db.company.findFirst({
    where: { id: input.companyId, tenantId: TENANT_ID, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!company) return { error: "Cég nem található" };

  if (input.personId != null) {
    const person = await db.person.findFirst({
      where: { id: input.personId, tenantId: TENANT_ID },
      select: { id: true },
    });
    if (!person) return { error: "Személy nem található" };
  }

  const callId = crypto.randomUUID();
  const payload = {
    event: "call_started",
    callId,
    tenantId: TENANT_ID,
    companyId: company.id,
    company: company.name,
    personId: input.personId ?? null,
    contact: input.contactName ?? null,
    phone: input.phone ?? null,
    startedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { error: `Webhook hiba (${res.status})` };
  } catch {
    return { error: "Webhook nem elérhető" };
  }
  return { callId };
}

export interface RecordCallInput {
  companyId: number;
  personId?: number | null;
  outcome: string; // CALL_OUTCOMES key
  notes?: string;
  followupDate?: string | null; // yyyy-mm-dd → schedules a follow-up call task
  durationSec?: number | null; // call length, appended to the interaction note
}

export interface RecordCallResult {
  success: true;
  newStatus: string | null; // the status the company moved to, or null if unchanged
  taskCreated: boolean;
}

/**
 * Record one /calls cockpit tap through the one call-outcome writer (C1, 2026-11-12):
 * - the company waits for a call in a campaign: the touch is that campaign's recordOutcome
 *   (call log, company status, lead link or promotion, member, event, automations, audit);
 *   the company's other campaigns waiting for a call advance without a second call log;
 * - otherwise: the call log and company status here, linked to the company's open lead,
 *   whose open call tasks are done (the call happened), as on the lead page.
 * The optional follow-up task is created after the call is logged, on the lead when there is one.
 */
export async function recordCall(
  input: RecordCallInput,
): Promise<RecordCallResult | { error: string }> {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return { error: ctx.error };
  if (!isCallOutcome(input.outcome)) return { error: "Ismeretlen kimenetel" };
  const outcome = input.outcome as CampaignCallOutcomeKey;

  const company = await db.company.findFirst({
    where: { id: input.companyId, tenantId: TENANT_ID, deletedAt: null },
    select: { id: true, name: true, pipelineStatus: true },
  });
  if (!company) return { error: "Cég nem található" };

  if (input.personId != null) {
    const person = await db.person.findFirst({
      where: { id: input.personId, tenantId: TENANT_ID },
      select: { id: true },
    });
    if (!person) return { error: "Személy nem található" };
  }

  const followupRaw = input.followupDate?.trim();
  const followupDate = followupRaw ? new Date(followupRaw) : null;
  if (followupDate && Number.isNaN(followupDate.getTime())) {
    return { error: "Érvénytelen visszahívási dátum" };
  }

  const meta = outcomeMeta(input.outcome)!;
  const newStatus = nextStatusFor(input.outcome, company.pipelineStatus);
  const personId = input.personId ?? null;
  const now = new Date();
  const campaignCtx = { tenantId: TENANT_ID, userId: ctx.userId };
  let leadId: number | null;

  const [first] = await findCallableMembers(TENANT_ID, company.id);
  if (first) {
    const r = await recordOutcome(campaignCtx, first.slug, {
      member_id: first.memberId, outcome,
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      ...(input.durationSec ? { duration_sec: input.durationSec } : {}),
      ...(followupRaw ? { followup_date: followupRaw } : {}),
    }, now);
    if ("error" in r) return { error: r.error };
    leadId = r.lead?.id ?? (await openLeadOf(company.id))?.id ?? null;
    await advanceMembersForCall(campaignCtx, company.id, outcome, now, first.campaignId);
  } else {
    // A quick outcome tap needn't carry a typed note: fall back to the label so the
    // append-only log still says what happened. Append the call length when known.
    const base = input.notes?.trim() || meta.label;
    const dur = input.durationSec && input.durationSec > 0 ? Math.round(input.durationSec) : null;
    const notes = dur ? `${base} · ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, "0")}` : base;
    const lead = await openLeadOf(company.id);
    leadId = lead?.id ?? null;

    // Core write is atomic: the call log, the lead's call tasks and the status/freshness move land together.
    const interaction = await db.$transaction(async (tx) => {
      const it = await tx.interaction.create({
        data: {
          tenantId: TENANT_ID, companyId: company.id, personId, leadId, userId: ctx.userId,
          type: "call", direction: "outbound", notes, outcome: meta.interactionOutcome, occurredAt: now,
        },
      });
      if (leadId != null) await completeOpenLeadCallTasks(tx, leadId, TENANT_ID, now);
      await tx.company.update({
        where: { id: company.id },
        data: { lastInteractionDate: now, updatedAt: now, ...(newStatus !== null ? { pipelineStatus: newStatus } : {}) },
      });
      return it;
    });
    await recomputeCloseness({ tenantId: TENANT_ID, companyId: company.id, personId });
    await audit("interaction", interaction.id, "create", null, {
      type: "call", outcome: meta.interactionOutcome, companyId: company.id, personId, leadId,
    });
    if (newStatus !== null) {
      await audit("company", company.id, "update", { pipelineStatus: company.pipelineStatus }, { pipelineStatus: newStatus });
    }
  }

  // Follow-up task is a convenience on top: created after the call is safely
  // logged so it can never roll back the interaction.
  const task = followupDate
    ? await db.task.create({
        data: {
          tenantId: TENANT_ID, companyId: company.id, personId, leadId, assignedToId: ctx.userId,
          title: `Visszahívás: ${company.name}`, type: "call", category: "revenue_generating",
          status: "created", dueDate: followupDate,
        },
      })
    : null;
  if (task && leadId != null && !first) {
    // Same as a plain callback on the lead page: the lead's next step is this call.
    await db.lead.updateMany({ where: { id: leadId, tenantId: TENANT_ID }, data: { nextAction: "Visszahívás", nextDue: followupDate } });
  }
  if (task) {
    await audit("task", task.id, "create", null, {
      title: task.title,
      dueDate: followupDate?.toISOString() ?? null,
      leadId,
    });
  }

  revalidatePath("/calls");
  revalidatePath(`/companies/${company.id}`);
  if (leadId != null) revalidatePath(`/leads/${leadId}`);
  return { success: true, newStatus, taskCreated: Boolean(task) };
}

function openLeadOf(companyId: number) {
  return db.lead.findFirst({
    where: { tenantId: TENANT_ID, companyId, outcome: "open", convertedDealId: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}
