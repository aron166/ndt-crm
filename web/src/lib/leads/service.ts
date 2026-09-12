import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, type AuditOptions } from "@/lib/audit";
import { runAutomations } from "@/lib/automations/engine";
import { recomputeCloseness } from "@/lib/enrichment/recompute";
import { getLeadStatuses, getQualificationQuestions, getScriptVariants } from "./queries";
import { leadStatusLabel } from "./statuses";
import {
  callOutcomeSchema, planCallOutcome, LEAD_OUTCOMES, LOST_REASON_MIN, LOST_REASON_MAX,
  RECALL_STATUS, type LeadOutcome,
} from "./outcomes";
import { parseAnswers, answersFrom } from "./qualification";
import { computeTier } from "./tier";

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

/**
 * The lead's open callback/call tasks are done — the call happened, or the card
 * moved on. Shared by changeLeadStatus and logLeadCallOutcome so the two
 * directions of the task↔kanban sync cannot drift, and so a second callback task
 * can never exist alongside the first (Péter: "duplication structurally
 * impossible"). Takes a tx client so it can run inside the outcome transaction.
 */
export async function completeOpenLeadCallTasks(
  tx: Pick<typeof db, "task">,
  leadId: number,
  tenantId: number,
  now: Date,
): Promise<number> {
  const { count } = await tx.task.updateMany({
    where: { tenantId, leadId, type: "call", status: { in: ["created", "in_progress"] } },
    data: { status: "done", completedAt: now },
  });
  return count;
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
  // Moving the card is acting on the lead → its open callback task is done.
  // EXCEPT into `recall`, which IS "call this back later": closing the reminder
  // there would silently delete the only thing telling anyone to call.
  const now = new Date();
  const closedTasks = newStatus === RECALL_STATUS
    ? 0
    : await completeOpenLeadCallTasks(db, leadId, ctx.tenantId, now);
  if (closedTasks > 0) {
    audit("lead", leadId, "update", { openCallTasks: closedTasks }, { openCallTasks: 0 }, auditOpts(ctx));
  }
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

  // A reason is MANDATORY on lost (Péter, 2026-09-07) — no "manual" placeholder.
  // An already-lost lead keeps its stored reason if the caller sends none.
  let reason: string | undefined;
  if (outcome === "lost") {
    reason = lostReason?.trim() || before.lostReason?.trim() || undefined;
    if (!reason || reason.length < LOST_REASON_MIN) {
      return { error: "A vesztett kimenetelhez indok kötelező (min. 3 karakter)" };
    }
    reason = reason.slice(0, LOST_REASON_MAX);
  }

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
    ...(outcome === "lost" ? { lostReason: reason } : {}),
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

/**
 * Setter tab — merge free-text qualification answers onto the lead. The ONE write
 * path (UI action + PATCH /api/leads/:id both land here).
 *
 * Merge, not replace: a surface showing only some questions must not wipe the
 * rest. Every slug the caller SUBMITTED is authoritative, so submitting a blank
 * clears that one answer. Unknown slugs are rejected — a typo'd key would sit in
 * the JSON forever, invisible because no question renders it.
 */
export async function setLeadQualification(
  leadId: number,
  answers: Record<string, string>,
  ctx: LeadCtx,
): Promise<Result> {
  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId: ctx.tenantId },
    select: { qualification: true, tier: true },
  });
  if (!lead) return { error: "Lead nem található" };

  const questions = await getQualificationQuestions(ctx.tenantId);
  const parsed = parseAnswers(answers, questions);
  if ("error" in parsed) return { error: parsed.error };

  const before = answersFrom(lead.qualification);
  const merged: Record<string, string> = { ...before };
  for (const slug of Object.keys(answers)) delete merged[slug];
  Object.assign(merged, parsed);

  if (JSON.stringify(before) === JSON.stringify(merged)) return { success: true };

  // The tier is derived, so it is recomputed HERE — the one write path for
  // setter answers (panel + PATCH /api/leads/:id both land here). Never stored
  // stale, never entered by hand.
  //
  // computeTier can return null ("not yet placeable" — see its final branch).
  // A setter saving one answer must not null out a tier a PREVIOUS answer
  // already placed the lead into, so an unplaced result falls back to the
  // lead's current tier rather than clearing it.
  const tier = computeTier(merged) ?? lead.tier;

  await db.lead.updateMany({
    where: { id: leadId, tenantId: ctx.tenantId },
    data: { qualification: merged, tier },
  });
  audit("lead", leadId, "update",
    { qualification: before, tier: lead.tier },
    { qualification: merged, tier },
    auditOpts(ctx));
  return { success: true };
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

  // An unknown script key is a 400, never a silent write: the whole point of
  // the variant is that its calls can be counted, and a typo'd key becomes a
  // statistics bucket nobody is looking at. Same rule as a qualification slug.
  if (input.scriptVariant) {
    const variants = await getScriptVariants(ctx.tenantId);
    if (!variants.some((v) => v.key === input.scriptVariant)) {
      return { error: `Ismeretlen szkriptváltozat: ${input.scriptVariant}` };
    }
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
        scriptVariant: input.scriptVariant ?? null,
      },
      select: { id: true },
    });
    // The call happened → any earlier open callback task for this lead is done.
    // Runs BEFORE the create below, inside the same transaction, so a lead can
    // never end up with two open callback tasks.
    await completeOpenLeadCallTasks(tx, leadId, ctx.tenantId, now);
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
  await recomputeCloseness({ tenantId: ctx.tenantId, companyId: lead.companyId, personId });

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
