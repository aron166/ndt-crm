import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, type AuditOptions } from "@/lib/audit";
import { runAutomations } from "@/lib/automations/engine";
import { getLeadStatuses } from "./queries";
import { leadStatusLabel } from "./statuses";
import {
  callOutcomeSchema, planCallOutcome, LEAD_OUTCOMES,
  type LeadOutcome,
} from "./outcomes";

// The ONE write path for lead process changes — used by the server actions (UI)
// and the public /api/leads routes alike, so the rules can't drift between the
// two. Transport-agnostic: no FormData, no NextResponse, no revalidatePath.

export interface LeadCtx {
  tenantId: number;
  /** `users.id` of the acting human, null for app/agent callers. */
  userId: number | null;
  actor: "user" | "agent";
  /** App slug / agent id for audit attribution when actor = agent. */
  actorAgentId?: string;
}

function auditOpts(ctx: LeadCtx): AuditOptions {
  return { tenantId: ctx.tenantId, actor: ctx.actor, actorAgentId: ctx.actorAgentId };
}

type Result<T = object> = ({ success: true } & T) | { error: string };

const LEAD_EVENT_SELECT = {
  status: true, outcome: true, companyId: true, source: true, serviceInterest: true,
  estimatedValue: true, convertedDealId: true, assignedToId: true, lostReason: true,
  channel: true,
  company: { select: { name: true } },
  contact: { select: { personId: true, person: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.LeadSelect;
type LeadRow = Prisma.LeadGetPayload<{ select: typeof LEAD_EVENT_SELECT }>;

async function loadLead(id: number, tenantId: number): Promise<LeadRow | null> {
  return db.lead.findFirst({ where: { id, tenantId }, select: LEAD_EVENT_SELECT });
}

function eventFields(lead: LeadRow, over: Record<string, string | number | null> = {}) {
  return {
    company: lead.company?.name ?? null,
    status: lead.status,
    outcome: lead.outcome,
    channel: lead.channel,
    source: lead.source,
    serviceInterest: lead.serviceInterest,
    estimatedValue: lead.estimatedValue != null ? Number(lead.estimatedValue) : null,
    ...over,
  };
}

/** Move a lead to another column. Fires lead_status_changed automations. */
export async function changeLeadStatus(
  leadId: number,
  newStatus: string,
  ctx: LeadCtx,
  opts: { fireAutomations?: boolean } = {},
): Promise<Result<{ changed: boolean }>> {
  const statuses = await getLeadStatuses(ctx.tenantId);
  if (!statuses.some((s) => s.key === newStatus)) return { error: "Ismeretlen státusz" };

  const before = await loadLead(leadId, ctx.tenantId);
  if (!before) return { error: "Lead nem található" };
  if (before.status === newStatus) return { success: true, changed: false };

  await db.lead.updateMany({ where: { id: leadId, tenantId: ctx.tenantId }, data: { status: newStatus } });
  audit("lead", leadId, "update",
    { status: before.status, statusLabel: leadStatusLabel(before.status, statuses) },
    { status: newStatus, statusLabel: leadStatusLabel(newStatus, statuses) },
    auditOpts(ctx));

  if (opts.fireAutomations !== false) {
    await runAutomations({
      type: "lead_status_changed",
      tenantId: ctx.tenantId,
      leadId,
      companyId: before.companyId,
      personId: before.contact?.personId ?? null,
      companyName: before.company?.name ?? null,
      toStatus: newStatus,
      fields: eventFields(before, { status: newStatus }),
    });
  }
  return { success: true, changed: true };
}

/** Set the lead's responsible user (null = unassigned). */
export async function assignLead(
  leadId: number,
  assignedToId: number | null,
  ctx: LeadCtx,
): Promise<Result> {
  const before = await loadLead(leadId, ctx.tenantId);
  if (!before) return { error: "Lead nem található" };
  if (assignedToId != null) {
    const user = await db.user.findFirst({ where: { id: assignedToId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!user) return { error: "Felhasználó nem található" };
  }
  if (before.assignedToId === assignedToId) return { success: true };
  await db.lead.updateMany({ where: { id: leadId, tenantId: ctx.tenantId }, data: { assignedToId } });
  audit("lead", leadId, "update", { assignedToId: before.assignedToId }, { assignedToId }, auditOpts(ctx));
  return { success: true };
}

/**
 * Convert a lead into a Deal in the default pipeline (first stage). Stamps
 * convertedDealId/convertedAt atomically (the conditional updateMany is the
 * double-submit guard). The lead entity is kept for history, never duplicated.
 */
export async function convertLeadToDeal(leadId: number, ctx: LeadCtx): Promise<Result<{ dealId: number }>> {
  const { tenantId } = ctx;
  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId },
    include: { company: { select: { id: true, name: true } }, contact: { select: { personId: true } } },
  });
  if (!lead) return { error: "Lead nem található" };
  if (lead.convertedDealId) return { success: true, dealId: lead.convertedDealId };
  if (!lead.companyId || !lead.company) return { error: "A leadhez nincs cég társítva" };

  const pipeline = await db.pipeline.findFirst({
    where: { tenantId, isArchived: false },
    orderBy: { position: "asc" },
    include: { stages: { orderBy: { position: "asc" }, take: 1 } },
  });
  if (!pipeline) return { error: "Nincs pipeline — hozz létre egyet előbb" };
  const firstStage = pipeline.stages[0];
  if (!firstStage) return { error: "A pipeline-nak nincs egyetlen szakasza sem — előbb hozz létre egyet" };

  const companyId = lead.companyId;
  const title = lead.serviceInterest?.trim() || `${lead.company.name} — érdeklődés`;
  let dealId: number;
  try {
    dealId = await db.$transaction(async (tx) => {
      const maxPos = await tx.deal.aggregate({ where: { tenantId, stageId: firstStage.id }, _max: { position: true } });
      const deal = await tx.deal.create({
        data: {
          tenantId, title, companyId,
          personId: lead.contact?.personId ?? null,
          assignedToId: lead.assignedToId,
          pipelineId: pipeline.id, stageId: firstStage.id,
          value: lead.estimatedValue ?? null, currency: "HUF",
          position: (maxPos._max.position ?? -1) + 1,
          stageEnteredAt: new Date(),
        },
        select: { id: true },
      });
      const claim = await tx.lead.updateMany({
        where: { id: leadId, tenantId, convertedDealId: null },
        data: { convertedDealId: deal.id, convertedAt: new Date() },
      });
      if (claim.count === 0) throw new Error("LEAD_ALREADY_CONVERTED");
      return deal.id;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "LEAD_ALREADY_CONVERTED") return { error: "A lead már át lett alakítva deallé" };
    throw e;
  }
  audit("deal", dealId, "create", null, { title, fromLeadId: leadId }, auditOpts(ctx));
  audit("lead", leadId, "update", { convertedDealId: null }, { convertedDealId: dealId }, auditOpts(ctx));
  return { success: true, dealId };
}

/**
 * open | won | lost. `won` is the only door into the deal pipeline — it runs the
 * conversion; won/lost leads leave the active board. `open` re-opens a lost lead
 * (a converted one can't be re-opened: the deal is the tracker now).
 */
export async function setLeadOutcome(
  leadId: number,
  outcome: LeadOutcome,
  ctx: LeadCtx,
  lostReason?: string | null,
): Promise<Result<{ dealId?: number }>> {
  if (!LEAD_OUTCOMES.includes(outcome)) return { error: "Ismeretlen kimenetel" };
  const before = await loadLead(leadId, ctx.tenantId);
  if (!before) return { error: "Lead nem található" };

  let dealId: number | undefined;
  if (outcome === "won") {
    const conv = await convertLeadToDeal(leadId, ctx);
    if ("error" in conv) return conv;
    dealId = conv.dealId;
  }
  if (outcome === "open" && before.convertedDealId) {
    return { error: "Deallé alakított lead nem nyitható újra" };
  }

  const data: Prisma.LeadUpdateManyMutationInput = {
    outcome,
    closedAt: outcome === "open" ? null : new Date(),
    ...(outcome === "lost" ? { lostReason: lostReason?.trim() || before.lostReason || "manual" } : {}),
  };
  if (before.outcome !== outcome || outcome === "lost") {
    await db.lead.updateMany({ where: { id: leadId, tenantId: ctx.tenantId }, data });
    audit("lead", leadId, "update",
      { outcome: before.outcome, lostReason: before.lostReason },
      { outcome, lostReason: data.lostReason ?? before.lostReason },
      auditOpts(ctx));
  }
  return { success: true, dealId };
}

export interface LogCallResult {
  interactionId: number;
  status: string | null;
  outcome: LeadOutcome;
  taskId: number | null;
}

/**
 * "Hívás eredménye": one append-only Interaction (call/outbound, outcome key,
 * mandatory note) linked to the lead + its person/company, then the transition
 * planCallOutcome decides (stage advance / recall + callback task / lost /
 * demo column). Rejects on a closed lead. Raw input is validated HERE (Zod) so
 * the UI and the API share the same gate.
 */
export async function logLeadCallOutcome(
  leadId: number,
  rawInput: unknown,
  ctx: LeadCtx,
): Promise<Result<LogCallResult> | { error: string; issues: Record<string, string[] | undefined> }> {
  const parsed = callOutcomeSchema.safeParse(rawInput);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const first = Object.values(flat.fieldErrors).flat().find(Boolean) ?? flat.formErrors[0];
    return { error: first ?? "Érvénytelen adat", issues: flat.fieldErrors };
  }
  const input = parsed.data;

  const lead = await loadLead(leadId, ctx.tenantId);
  if (!lead) return { error: "Lead nem található" };
  if (lead.outcome !== "open" || lead.convertedDealId) {
    return { error: "A lead már lezárt — előbb nyisd újra" };
  }
  if (input.assignedToId != null) {
    const user = await db.user.findFirst({ where: { id: input.assignedToId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!user) return { error: "Felhasználó nem található" };
  }

  const statuses = await getLeadStatuses(ctx.tenantId);
  const plan = planCallOutcome(input, lead.status, statuses.map((s) => s.key));
  const personId = lead.contact?.personId ?? null;
  const now = new Date();
  const p = lead.contact?.person;
  const who = p ? `${p.lastName} ${p.firstName}`.trim() : lead.company?.name ?? `Lead #${leadId}`;

  const { interaction, task } = await db.$transaction(async (tx) => {
    const interaction = await tx.interaction.create({
      data: {
        tenantId: ctx.tenantId, leadId, companyId: lead.companyId, personId, userId: ctx.userId,
        type: "call", direction: "outbound", outcome: input.outcome, notes: input.note, occurredAt: now,
      },
      select: { id: true },
    });
    // The call happened → any earlier open callback task for this lead is done.
    await tx.task.updateMany({
      where: { tenantId: ctx.tenantId, leadId, type: "call", status: { in: ["created", "in_progress"] } },
      data: { status: "done", completedAt: now },
    });
    const task = plan.callbackAt
      ? await tx.task.create({
          data: {
            tenantId: ctx.tenantId, leadId, companyId: lead.companyId, personId,
            assignedToId: input.assignedToId ?? ctx.userId,
            title: `Visszahívás: ${who}`, type: "call", category: "revenue_generating",
            status: "created", dueDate: plan.callbackAt,
          },
          select: { id: true },
        })
      : null;
    await tx.lead.updateMany({
      where: { id: leadId, tenantId: ctx.tenantId },
      data: {
        ...(plan.status ? { status: plan.status } : {}),
        ...(plan.lost ? { outcome: "lost", closedAt: now, lostReason: plan.lost.lostReason } : {}),
      },
    });
    if (lead.companyId) {
      await tx.company.updateMany({ where: { id: lead.companyId, tenantId: ctx.tenantId }, data: { lastInteractionDate: now } });
    }
    return { interaction, task };
  });

  audit("interaction", interaction.id, "create", null,
    { type: "call", outcome: input.outcome, leadId, companyId: lead.companyId, personId }, auditOpts(ctx));
  if (task) {
    audit("task", task.id, "create", null, { title: `Visszahívás: ${who}`, dueDate: plan.callbackAt?.toISOString() ?? null, leadId }, auditOpts(ctx));
  }
  if (plan.status || plan.lost) {
    audit("lead", leadId, "update",
      { status: lead.status, outcome: lead.outcome },
      { status: plan.status ?? lead.status, outcome: plan.lost ? "lost" : lead.outcome, lostReason: plan.lost?.lostReason ?? lead.lostReason },
      auditOpts(ctx));
  }

  if (plan.status) {
    await runAutomations({
      type: "lead_status_changed",
      tenantId: ctx.tenantId, leadId,
      companyId: lead.companyId, personId, companyName: lead.company?.name ?? null,
      toStatus: plan.status,
      fields: eventFields(lead, { status: plan.status, callOutcome: input.outcome }),
    });
  }

  return {
    success: true,
    interactionId: interaction.id,
    status: plan.status ?? lead.status,
    outcome: plan.lost ? "lost" : "open",
    taskId: task?.id ?? null,
  };
}
