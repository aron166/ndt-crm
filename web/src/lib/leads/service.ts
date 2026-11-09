import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, type AuditOptions } from "@/lib/audit";
import { runAutomations } from "@/lib/automations/engine";
import { recomputeCloseness } from "@/lib/enrichment/recompute";
import { getLeadStatuses, getLeadTransitions, getQualificationQuestions, getScriptVariants } from "./queries";
import { leadStatusLabel } from "./statuses";
import {
  callOutcomeSchema, planCallOutcome, LEAD_OUTCOMES, LOST_REASON_MIN, LOST_REASON_MAX,
  RECALL_STATUS, bookingIssue, type LeadOutcome,
} from "./outcomes";
import {
  isLostReason, planTransition, transitionsBetween, findTransition,
  type LeadTransition, type TransitionInput, type TransitionPlan,
} from "./lifecycle";
import {
  parseAnswers, answersFrom, answerSourcesFrom, withAnswers, effectiveAnswers, legacyAnswers,
} from "./qualification";
import { computeTier } from "./tier";
import { reportError } from "@/lib/report-error";
import { DEFAULT_BOOKING_MINUTES, conflictsFor } from "@/lib/booking/conflicts";
import { loadBookings, resolveDemoHost } from "@/lib/booking/queries";

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
  channel: true, campaign: true,
  attempts: true, offerType: true, nextAction: true, nextDue: true, statusEnteredAt: true,
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

/** Tag on every task the lifecycle creates, so a later stage move can retire them. */
export const LIFECYCLE_TASK_TAG = "w2_lifecycle";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Write ONE planned lifecycle move (W2): the lead columns, the append-only
 * lead_status_history row, and the tasks the move creates. Open lifecycle tasks
 * of the previous stage are cancelled on a real stage change. Creates TASKS
 * only: nothing here sends anything to the lead.
 */
export async function writeLeadTransition(
  tx: Tx,
  args: {
    leadId: number; tenantId: number; fromStatus: string | null; transition: LeadTransition; plan: TransitionPlan;
    companyId: number | null; personId: number | null; who: string;
    actorUserId: number | null; actorAgentId?: string | null; escalationUserId?: number | null; now: Date;
  },
): Promise<number[]> {
  const { leadId, tenantId, plan, now } = args;
  if (!plan.self) {
    await tx.task.updateMany({
      where: { tenantId, leadId, status: { in: ["created", "in_progress"] }, setMembership: { has: LIFECYCLE_TASK_TAG } },
      data: { status: "cancelled" },
    });
  }
  await tx.lead.updateMany({ where: { id: leadId, tenantId }, data: plan.data });
  await tx.leadStatusHistory.create({
    data: {
      tenantId, leadId, fromStatus: args.fromStatus, toStatus: plan.data.status, event: args.transition.event,
      actorUserId: args.actorUserId, actorAgentId: args.actorAgentId ?? null, at: now,
    },
  });
  const ids: number[] = [];
  for (const t of plan.tasks) {
    const task = await tx.task.create({
      data: {
        tenantId, leadId, companyId: args.companyId, personId: args.personId,
        assignedToId: t.escalate ? (args.escalationUserId ?? plan.data.assignedToId) : plan.data.assignedToId,
        title: `${t.title}: ${args.who}`, type: t.type, category: "revenue_generating",
        status: "created", dueDate: t.dueDate, setMembership: [LIFECYCLE_TASK_TAG],
      },
      select: { id: true },
    });
    ids.push(task.id);
  }
  return ids;
}

function leadWho(lead: LeadRow, leadId: number): string {
  const p = lead.contact?.person;
  return p ? `${p.lastName} ${p.firstName}`.trim() : lead.company?.name ?? `Lead #${leadId}`;
}

/** Input a stage move may carry (board prompt, API, automations). */
export interface ChangeLeadStatusOpts extends Omit<TransitionInput, "tasks" | "attempts"> {
  fireAutomations?: boolean;
  /** Which table event this is; omitted = the first row from the current stage to the target. */
  event?: string;
}

/**
 * Move a lead to another column (W2). Only moves in the tenant's transition
 * table are allowed, and an open lead never leaves without owner + next action +
 * next due. Logs lead_status_history, stamps status_entered_at, creates the
 * stage's tasks. Fires lead_status_changed automations.
 */
export async function changeLeadStatus(
  leadId: number,
  newStatus: string,
  ctx: LeadCtx,
  opts: ChangeLeadStatusOpts = {},
): Promise<Result<{ changed: boolean }>> {
  const statuses = await getLeadStatuses(ctx.tenantId);
  if (!statuses.some((s) => s.key === newStatus)) return { error: "Ismeretlen státusz" };

  const before = await loadLead(leadId, ctx.tenantId);
  if (!before) return { error: "Lead nem található" };
  if (before.status === newStatus && !opts.event) return { success: true, changed: false };

  const from = before.status ?? "new";
  const table = await getLeadTransitions(ctx.tenantId);
  const transition = opts.event
    ? findTransition(table, from, opts.event)
    : transitionsBetween(table, from, newStatus)[0] ?? null;
  if (!transition || transition.to !== newStatus) {
    return { error: `Nem engedélyezett lépés: ${leadStatusLabel(before.status, statuses)} → ${leadStatusLabel(newStatus, statuses)}` };
  }
  if (opts.ownerId != null) {
    const user = await db.user.findFirst({ where: { id: opts.ownerId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!user) return { error: "Felhasználó nem található" };
  }
  if (opts.lostReason != null && !isLostReason(opts.lostReason)) return { error: "Ismeretlen elvesztési ok" };

  const now = new Date();
  const plan = planTransition(before, transition, {
    ownerId: opts.ownerId, nextAction: opts.nextAction, nextDue: opts.nextDue, offerType: opts.offerType,
    lostReason: opts.lostReason, lostNote: opts.lostNote, recallReason: opts.recallReason, recallDate: opts.recallDate,
  }, now);
  if ("error" in plan) return plan;

  const escalationUserId = plan.tasks.some((t) => t.escalate) ? await resolveDemoHost(ctx.tenantId, "aron") : null;
  await db.$transaction(async (tx) => {
    // Moving the card is acting on the lead: its open callback task is done.
    // EXCEPT into `recall`, which IS "call this back later".
    if (newStatus !== RECALL_STATUS) await completeOpenLeadCallTasks(tx, leadId, ctx.tenantId, now);
    await writeLeadTransition(tx, {
      leadId, tenantId: ctx.tenantId, fromStatus: before.status, transition, plan,
      companyId: before.companyId, personId: before.contact?.personId ?? null, who: leadWho(before, leadId),
      actorUserId: ctx.userId, actorAgentId: ctx.actorAgentId, escalationUserId, now,
    });
  });
  audit("lead", leadId, "update",
    { status: before.status, statusLabel: leadStatusLabel(before.status, statuses), nextAction: before.nextAction },
    { status: newStatus, statusLabel: leadStatusLabel(newStatus, statuses), event: transition.event, nextAction: plan.data.nextAction },
    auditOpts(ctx));

  if (opts.fireAutomations !== false && !plan.self) {
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
  if (!pipeline) return { error: "Nincs pipeline: hozz létre egyet előbb" };
  const firstStage = pipeline.stages[0];
  if (!firstStage) return { error: "A pipeline-nak nincs egyetlen szakasza sem: előbb hozz létre egyet" };

  const companyId = lead.companyId;
  const title = lead.serviceInterest?.trim() || `${lead.company.name}: érdeklődés`;
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

  // W2: lost is a stage. Closing / reopening goes through the transition table
  // (lead_lost / lead_reopened rows), so it is logged with a reason code. Free
  // text that is not a code is kept as the note under "other".
  if (outcome === "lost" && before.status !== "lost") {
    const code = isLostReason(reason) ? reason : "other";
    const r = await changeLeadStatus(leadId, "lost", ctx, {
      event: "lead_lost", lostReason: code, lostNote: code === reason ? null : reason,
    });
    return "error" in r ? r : { success: true };
  }
  if (outcome === "open" && before.status === "lost") {
    if (before.convertedDealId) return { error: "Deallé alakított lead nem nyitható újra" };
    const r = await changeLeadStatus(leadId, "new", ctx, { event: "lead_reopened" });
    return "error" in r ? r : { success: true };
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

  // Already-lost lead: only its reason changes (same code/note split as above).
  const lostCode = reason && isLostReason(reason) ? reason : "other";
  const data: Prisma.LeadUpdateManyMutationInput = {
    outcome,
    closedAt: outcome === "open" ? null : new Date(),
    ...(outcome === "lost" ? { lostReason: lostCode, lostNote: lostCode === reason ? null : reason } : {}),
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
    select: { qualification: true, answerSources: true, tier: true },
  });
  if (!lead) return { error: "Lead nem található" };

  const questions = await getQualificationQuestions(ctx.tenantId);
  const parsed = parseAnswers(answers, questions);
  if ("error" in parsed) return { error: parsed.error };

  const before = answersFrom(lead.qualification);
  // Submitted-but-blank clears that slug, so every submitted key is passed
  // through (parseAnswers drops the blanks, withAnswers needs to see them).
  const submitted: Record<string, string> = {};
  for (const slug of Object.keys(answers)) submitted[slug] = parsed[slug] ?? "";

  // The setter layer, written WITHOUT touching what the form said. An answer
  // the setter gives outranks the form answer for tier purposes; the form
  // answer stays visible on the lead with its own timestamp.
  const beforeSources = answerSourcesFrom(lead.answerSources);
  const sources = withAnswers(beforeSources, "setter", submitted);
  // Answers recorded before this column existed have no origin. They are still
  // the lead's answers, so they stay in the effective map.
  //
  // Computed from the PRE-write state, and never for a slug this call submitted.
  // Reading it off the post-write sources instead re-classified the setter's own
  // answer as legacy the moment they blanked it: the value survived in
  // `qualification` and then reappeared on the lead under "forrás ismeretlen".
  // It also made a legacy answer undeletable, and silently so — both comparisons
  // below matched, so the action returned success having written nothing.
  // (Vanda, #113.)
  const legacy = legacyAnswers(beforeSources, before);
  for (const slug of Object.keys(submitted)) delete legacy[slug];
  const merged: Record<string, string> = { ...legacy, ...effectiveAnswers(sources) };

  // Both are compared: a setter who confirms the form's answer word for word
  // changes no effective answer but DOES add a call-sourced record, and the
  // lead page exists to show that it was confirmed on the phone.
  if (
    JSON.stringify(before) === JSON.stringify(merged) &&
    JSON.stringify(beforeSources) === JSON.stringify(sources)
  ) {
    return { success: true };
  }

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
    data: { qualification: merged, answerSources: sources as Prisma.InputJsonValue, tier },
  });
  audit("lead", leadId, "update",
    { qualification: before, tier: lead.tier, answerSources: beforeSources },
    { qualification: merged, tier, answerSources: sources },
    auditOpts(ctx));
  return { success: true };
}

export interface LogCallResult {
  interactionId: number;
  status: string | null;
  outcome: LeadOutcome;
  taskId: number | null;
  bookingTaskId: number | null;
  /**
   * Collisions the new booking makes in its host's calendar. FLAGGED only —
   * the booking is written either way; a human decides what moves (Péter's rule).
   * `movable` names the lower-priority side.
   */
  bookingConflicts: BookingConflictInfo[];
}

export interface BookingConflictInfo {
  taskId: number;
  title: string;
  startsAt: string;
  overlapMinutes: number;
  movable: "new" | "existing";
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
  const now = new Date();
  const bIssue = bookingIssue(input, ctx.actor, now);
  if (bIssue) return { error: bIssue.message, issues: { [bIssue.path]: [bIssue.message] } };

  const lead = await loadLead(leadId, ctx.tenantId);
  if (!lead) return { error: "Lead nem található" };
  if (lead.outcome !== "open" || lead.convertedDealId) {
    return { error: "A lead már lezárt: előbb nyisd újra" };
  }
  // The row this one supersedes must be THIS lead's, in THIS tenant. Both
  // current callers check it too, but the guard belongs here: the FK only
  // proves the id exists somewhere, so without this a caller could point a
  // correction at another tenant's interaction and read its id back.
  if (input.supersedesInteractionId != null) {
    const target = await db.interaction.findFirst({
      where: { id: input.supersedesInteractionId, tenantId: ctx.tenantId, leadId },
      select: { id: true },
    });
    if (!target) return { error: "A felülírt interakció nem ehhez a leadhez tartozik" };
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

  // The demo lands on the HOST's calendar (finding 3), not the logger's.
  let bookingHostId: number | null = null;
  if (input.bookingAt) {
    // The schema guarantees demoWith with a booking (meeting_booked requires it).
    if (!input.demoWith) return { error: "Add meg, kivel lesz a demó (Áron / Péter)" };
    bookingHostId = await resolveDemoHost(ctx.tenantId, input.demoWith);
    if (bookingHostId == null) {
      return { error: "Nincs beállítva, ki tartja a demót (tenants.settings.demoHosts)" };
    }
  }

  const table = await getLeadTransitions(ctx.tenantId);
  const callPlan = planCallOutcome(input, lead, table, now);
  const personId = lead.contact?.personId ?? null;
  const who = leadWho(lead, leadId);
  // meeting_booked: whoever holds the meeting owns the lead (was demo_aron / demo_peter).
  if (input.outcome === "meeting_booked" && input.demoWith) {
    callPlan.input.ownerId = bookingHostId ?? await resolveDemoHost(ctx.tenantId, input.demoWith);
  }
  let transitionPlan: TransitionPlan | null = null;
  if (callPlan.transition) {
    const planned = planTransition(lead, callPlan.transition, callPlan.input, now);
    if ("error" in planned) return { error: planned.error, issues: {} };
    transitionPlan = planned;
  }
  const plan = {
    status: transitionPlan && !transitionPlan.self ? transitionPlan.data.status : null,
    lost: transitionPlan?.data.outcome === "lost" ? { lostReason: transitionPlan.data.lostReason ?? "other" } : null,
    callbackAt: callPlan.callbackAt, bookingAt: callPlan.bookingAt, bookingKind: callPlan.bookingKind,
  };
  const escalationUserId = transitionPlan?.tasks.some((t) => t.escalate) ? await resolveDemoHost(ctx.tenantId, "aron") : null;

  const { interaction, task, bookingTask } = await db.$transaction(async (tx) => {
    const interaction = await tx.interaction.create({
      data: {
        tenantId: ctx.tenantId, leadId, companyId: lead.companyId, personId, userId: ctx.userId,
        type: "call", direction: "outbound", outcome: input.outcome, notes: input.note,
        occurredAt: input.occurredAt ?? now,
        scriptVariant: input.scriptVariant ?? null,
        technologyWord: input.technologyWord ?? null,
        campaign: lead.campaign,
        transcript: input.transcript ?? null,
        autoConfidence: input.autoConfidence ?? null,
        callId: input.callId ?? null,
        supersedesInteractionId: input.supersedesInteractionId ?? null,
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
    const bookingTask = plan.bookingAt
      ? await tx.task.create({
          data: {
            tenantId: ctx.tenantId, leadId, companyId: lead.companyId, personId,
            assignedToId: bookingHostId,
            title: `Demó: ${who}`, type: "meeting", category: "revenue_generating",
            status: "created", startsAt: plan.bookingAt, dueDate: plan.bookingAt,
            bookingKind: plan.bookingKind, estimatedMinutes: DEFAULT_BOOKING_MINUTES,
          },
          select: { id: true },
        })
      : null;
    if (callPlan.transition && transitionPlan) {
      await writeLeadTransition(tx, {
        leadId, tenantId: ctx.tenantId, fromStatus: lead.status, transition: callPlan.transition, plan: transitionPlan,
        companyId: lead.companyId, personId, who, actorUserId: ctx.userId, actorAgentId: ctx.actorAgentId,
        escalationUserId, now,
      });
    } else if (plan.callbackAt) {
      await tx.lead.updateMany({
        where: { id: leadId, tenantId: ctx.tenantId },
        data: { nextAction: "Visszahívás", nextDue: plan.callbackAt },
      });
    }
    if (lead.companyId) {
      await tx.company.updateMany({ where: { id: lead.companyId, tenantId: ctx.tenantId }, data: { lastInteractionDate: input.occurredAt ?? now } });
    }
    return { interaction, task, bookingTask };
  });
  await recomputeCloseness({ tenantId: ctx.tenantId, companyId: lead.companyId, personId });

  // Conflict check on the WRITE (finding 5): a hand-typed date is the case that
  // actually happens. After the commit, flag-only — never blocks, never cancels.
  let bookingConflicts: BookingConflictInfo[] = [];
  if (bookingTask && plan.bookingAt && bookingHostId != null) try {
    const day = 86_400_000;
    const others = await loadBookings(ctx.tenantId, bookingHostId,
      new Date(plan.bookingAt.getTime() - day), new Date(plan.bookingAt.getTime() + day), bookingTask.id);
    const candidate = {
      id: bookingTask.id, startsAt: plan.bookingAt, minutes: DEFAULT_BOOKING_MINUTES, assignedToId: bookingHostId,
      kind: plan.bookingKind, dealValue: null,
      estimatedValue: lead.estimatedValue != null ? Number(lead.estimatedValue) : null,
    };
    const titles = new Map(others.map((o) => [o.id, o.title]));
    bookingConflicts = conflictsFor(candidate, others).map((c) => {
      const other = c.keep.id === candidate.id ? c.bump : c.keep;
      return {
        taskId: other.id,
        title: titles.get(other.id) ?? `Foglalás #${other.id}`,
        startsAt: other.startsAt.toISOString(),
        overlapMinutes: c.overlapMinutes,
        movable: c.bump.id === candidate.id ? "new" : "existing",
      };
    });
  } catch (err) {
    // The call and the booking are committed — a failed flag must not turn
    // into a 500 that makes the setter retry and log the call twice.
    reportError("leads.bookingConflicts", err, { leadId, bookingTaskId: bookingTask.id });
  }

  audit("interaction", interaction.id, "create", null,
    { type: "call", outcome: input.outcome, leadId, companyId: lead.companyId, personId }, auditOpts(ctx));
  if (task) {
    audit("task", task.id, "create", null, { title: `Visszahívás: ${who}`, dueDate: plan.callbackAt?.toISOString() ?? null, leadId }, auditOpts(ctx));
  }
  if (bookingTask) {
    audit("task", bookingTask.id, "create", null, { title: `Demó: ${who}`, startsAt: plan.bookingAt?.toISOString() ?? null, bookingKind: plan.bookingKind, leadId }, auditOpts(ctx));
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
    bookingTaskId: bookingTask?.id ?? null,
    bookingConflicts,
  };
}
