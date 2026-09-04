import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import type {
  AutomationEvent,
  Condition,
  ConditionOp,
  AssignLeadActionConfig,
  ChangeLeadStatusActionConfig,
  CreateTaskActionConfig,
  SendEmailActionConfig,
  WebhookOutActionConfig,
  TriggerConfig,
  TriggerType,
} from "./types";

// ── Pure evaluation helpers (unit-tested without a DB) ──────────────

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

function evalCondition(
  c: Condition,
  fields: Record<string, string | number | null | undefined>,
): boolean {
  const actual = fields[c.field];
  const op: ConditionOp = c.op;
  switch (op) {
    case "is_empty":
      return isEmpty(actual);
    case "is_not_empty":
      return !isEmpty(actual);
    case "eq":
      return String(actual ?? "") === String(c.value ?? "");
    case "ne":
      return String(actual ?? "") !== String(c.value ?? "");
    case "gt": {
      const a = toNumber(actual), b = toNumber(c.value);
      return a !== null && b !== null && a > b;
    }
    case "lt": {
      const a = toNumber(actual), b = toNumber(c.value);
      return a !== null && b !== null && a < b;
    }
    case "contains":
      return String(actual ?? "").toLowerCase().includes(String(c.value ?? "").toLowerCase());
    default:
      return false;
  }
}

/**
 * Optional, AND-ed. Null/empty conditions = always passes. A malformed entry
 * fails CLOSED (the rule does not fire) — better to skip an automation than to
 * create an unintended task off a broken condition.
 */
export function conditionsPass(
  conditions: unknown,
  fields: Record<string, string | number | null | undefined>,
): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  return conditions.every((c) => {
    if (!c || typeof c !== "object" || typeof (c as Condition).field !== "string") return false;
    return evalCondition(c as Condition, fields);
  });
}

/** Does the rule's trigger (type + config) match this event? */
export function triggerMatches(
  triggerType: TriggerType,
  triggerConfig: unknown,
  event: AutomationEvent,
): boolean {
  if (triggerType !== event.type) return false;
  const cfg = (triggerConfig ?? {}) as TriggerConfig;
  switch (event.type) {
    case "lead_created":
      return true;
    case "lead_status_changed":
      return cfg.toStatus == null || cfg.toStatus === "" || cfg.toStatus === event.toStatus;
    case "deal_stage_changed":
      return cfg.toStageId == null || cfg.toStageId === event.toStageId;
    case "deal_idle_in_stage":
    case "lead_idle":
      // Evaluated by the scheduled job, not the event-driven path.
      return false;
    default:
      return false;
  }
}

/**
 * Render {company}/{message}/{sourceApp}/… tokens; unknown/empty tokens drop out.
 * `collapseWhitespace` (default true) squashes runs of whitespace to one space —
 * right for a task title, wrong for an email body, so callers can opt out to
 * preserve newlines/paragraphs.
 */
export function renderTemplate(
  template: string,
  event: AutomationEvent,
  collapseWhitespace = true,
): string {
  const replaced = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (key === "company") return event.companyName ?? "";
    const v = event.fields[key];
    return v === undefined || v === null ? "" : String(v);
  });
  return collapseWhitespace ? replaced.replace(/\s+/g, " ").trim() : replaced.trim();
}

/** Shape the Task row for a create_task action (pure — no DB). */
export function buildCreateTaskData(
  cfg: CreateTaskActionConfig,
  event: AutomationEvent,
  now: Date = new Date(),
): Prisma.TaskUncheckedCreateInput {
  const dueDate =
    cfg.dueInDays != null ? new Date(now.getTime() + cfg.dueInDays * 86_400_000) : null;
  return {
    tenantId: event.tenantId,
    companyId: event.companyId,
    personId: event.personId,
    dealId: event.dealId ?? null,
    leadId: event.leadId ?? null,
    title: renderTemplate(cfg.titleTemplate, event),
    description: cfg.descriptionTemplate ? renderTemplate(cfg.descriptionTemplate, event) : null,
    type: cfg.type ?? null,
    category: cfg.category ?? null,
    status: "created",
    dueDate,
    assignedToId: cfg.assignedToId ?? null,
  };
}

/**
 * Resolve the email to send an automated message to, from the event's entities:
 * the person's own email, else their current (open) work-contact email, else any
 * open contact at the company. Returns null when nothing is on file (skip the send).
 */
export async function resolveRecipientEmail(event: AutomationEvent): Promise<string | null> {
  if (event.personId) {
    const person = await db.person.findFirst({
      where: { id: event.personId, tenantId: event.tenantId },
      select: { email: true },
    });
    if (person?.email) return person.email;
    const contact = await db.contact.findFirst({
      where: { personId: event.personId, tenantId: event.tenantId, endedAt: null, email: { not: null } },
      select: { email: true },
    });
    if (contact?.email) return contact.email;
  }
  if (event.companyId) {
    // Only a PRIMARY open contact — never guess at a random contact for an
    // automated send; no primary on file ⇒ skip rather than email the wrong person.
    const contact = await db.contact.findFirst({
      where: { companyId: event.companyId, tenantId: event.tenantId, endedAt: null, isPrimary: true, email: { not: null } },
      select: { email: true },
    });
    if (contact?.email) return contact.email;
  }
  return null;
}

/**
 * Audit a task an automation rule created (system actor, attributed to the
 * rule). Dynamic import keeps next/server + Supabase out of the unit-test graph.
 */
export async function auditRuleTask(
  taskId: number,
  data: Prisma.TaskUncheckedCreateInput,
  ruleId: number,
  tenantId: number,
): Promise<void> {
  // The task is already committed. A failure here (dynamic import, audit
  // registration) must be reported but never propagate: it would abort the
  // caller before `lastRunAt` is stamped, for a row that already exists.
  try {
    const { audit } = await import("@/lib/audit");
    audit("task", taskId, "create", null,
      { title: data.title, type: data.type ?? null, dueDate: data.dueDate ?? null, dealId: data.dealId ?? null, ruleId },
      { tenantId, actor: "system", actorAgentId: `automation_rule:${ruleId}` });
  } catch (err) {
    reportError("automations.audit_rule_task", err, { taskId, ruleId });
  }
}

// ── Lead-scoped + outbound actions (v2) ─────────────────────────────

/**
 * Execute one non-task/email action. Returns false when the action is a no-op
 * for this event (e.g. no leadId), so the caller skips the lastRunAt stamp.
 * Lead writes here do NOT re-fire automations (no cascading rule chains — a
 * status→status rule pair would loop otherwise).
 */
export async function runLeadAction(
  actionType: string,
  actionConfig: unknown,
  ev: AutomationEvent,
): Promise<boolean> {
  if (actionType === "webhook_out") {
    const cfg = actionConfig as WebhookOutActionConfig;
    if (!cfg?.url || !/^https?:\/\//i.test(cfg.url)) return false;
    const { companyName, ...rest } = ev;
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: ev.type, ...rest, company: companyName ?? null, firedAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`webhook_out ${res.status}`);
    return true;
  }
  if (!ev.leadId) return false;
  if (actionType === "change_lead_status") {
    const cfg = actionConfig as ChangeLeadStatusActionConfig;
    if (!cfg?.toStatus) return false;
    const { changeLeadStatus } = await import("@/lib/leads/service");
    const r = await changeLeadStatus(ev.leadId, cfg.toStatus, systemCtx(ev.tenantId), { fireAutomations: false });
    if ("error" in r) throw new Error(r.error);
    return true;
  }
  if (actionType === "assign_lead") {
    const cfg = actionConfig as AssignLeadActionConfig;
    if (cfg?.assignedToId == null) return false;
    const { assignLead } = await import("@/lib/leads/service");
    const r = await assignLead(ev.leadId, Number(cfg.assignedToId), systemCtx(ev.tenantId));
    if ("error" in r) throw new Error(r.error);
    return true;
  }
  return false;
}

function systemCtx(tenantId: number) {
  return { tenantId, userId: null, actor: "agent" as const, actorAgentId: "automation" };
}

/**
 * Execute one rule's action for an event. Returns true when it fired (the
 * caller stamps lastRunAt), false when the action was a no-op for this event.
 * Shared by the event-driven orchestrator and the idle (cron) evaluators.
 */
export async function runAutomationAction(
  rule: { id: number; actionType: string; actionConfig: unknown },
  ev: AutomationEvent,
): Promise<boolean> {
  if (rule.actionType === "create_task") {
    const cfg = rule.actionConfig as unknown as CreateTaskActionConfig;
    if (!cfg?.titleTemplate) return false;
    const data = buildCreateTaskData(cfg, ev);
    const task = await db.task.create({ data, select: { id: true } });
    // Rule-created tasks are audited with the rule as the actor (Codex Batch A
    // #6b, #61). auditRuleTask never throws — the task is already committed.
    await auditRuleTask(task.id, data, rule.id, ev.tenantId);
  } else if (rule.actionType === "send_email") {
    const cfg = rule.actionConfig as unknown as SendEmailActionConfig;
    if (!cfg?.subjectTemplate || !cfg?.bodyTemplate) return false;
    const to = await resolveRecipientEmail(ev);
    if (!to) return false; // no address on file — skip (not an error)
    const recipient = to.trim().toLowerCase();

    // "Send once per recipient": skip if this rule already emailed them.
    if (cfg.sendOnce) {
      const prior = await db.automationEmailSend.findUnique({
        where: { ruleId_recipient: { ruleId: rule.id, recipient } },
        select: { id: true },
      });
      if (prior) return false;
    }

    // Dynamic import keeps the server-only Resend module out of the unit-test
    // import graph for this otherwise-pure engine module.
    const { sendEmail } = await import("@/lib/integrations/resend");
    const result = await sendEmail({
      to,
      subject: renderTemplate(cfg.subjectTemplate, ev),
      text: renderTemplate(cfg.bodyTemplate, ev, false),
      companyId: ev.companyId,
      personId: ev.personId,
    });
    if (!result.ok) {
      reportError("automations.send_email", new Error(result.error), { ruleId: rule.id, trigger: ev.type });
      return false;
    }
    if (cfg.sendOnce) {
      // Record the send. A P2002 unique-violation just means another worker
      // beat us (already recorded) — fine to ignore; any OTHER error must be
      // surfaced, not swallowed (a lost record could re-send next run).
      try {
        await db.automationEmailSend.create({ data: { tenantId: ev.tenantId, ruleId: rule.id, recipient } });
      } catch (err) {
        if ((err as { code?: string }).code !== "P2002") {
          reportError("automations.email_send_record", err, { ruleId: rule.id });
        }
      }
    }
  } else {
    if (!(await runLeadAction(rule.actionType, rule.actionConfig, ev))) return false;
  }
  return true;
}

// ── Orchestrator (DB-backed) ────────────────────────────────────────

/**
 * Load the triggering company's attributes as `company_*` condition fields, so
 * a rule can target on warmth / county / city / pipeline / industry — richer
 * filtering than the lead's own fields alone.
 */
async function loadCompanyFields(
  tenantId: number,
  companyId: number,
): Promise<Record<string, string | number | null>> {
  const c = await db.company.findFirst({
    where: { id: companyId, tenantId },
    select: { warmth: true, county: true, city: true, pipelineStatus: true, industryCode: true, teaorCode: true },
  });
  if (!c) return {};
  return {
    company_warmth: c.warmth,
    company_county: c.county,
    company_city: c.city,
    company_pipeline: c.pipelineStatus,
    company_industry: c.industryCode,
    company_teaor: c.teaorCode,
  };
}

/**
 * Run every active rule whose trigger matches this event. Fail-safe: an
 * automation error must never break the originating mutation (lead intake,
 * status/stage change), so everything is wrapped and logged, never thrown.
 * Call this AFTER the originating write has committed.
 */
export async function runAutomations(event: AutomationEvent): Promise<void> {
  try {
    const rules = await db.automationRule.findMany({
      where: { tenantId: event.tenantId, triggerType: event.type, isActive: true },
    });
    if (rules.length === 0) return;

    // Enrich once with company attributes for richer targeting. The event's own
    // fields win on any key clash. A failed enrichment must NOT abort the run —
    // degrade to the base event.
    let ev = event;
    if (event.companyId) {
      try {
        const companyFields = await loadCompanyFields(event.tenantId, event.companyId);
        ev = { ...event, fields: { ...companyFields, ...event.fields } };
      } catch (err) {
        reportError("automations.enrich", err, { trigger: event.type, companyId: event.companyId });
      }
    }

    for (const rule of rules) {
      // Per-rule isolation: one rule failing must not stop the others.
      try {
        if (!triggerMatches(rule.triggerType as TriggerType, rule.triggerConfig, ev)) continue;
        if (!conditionsPass(rule.conditions, ev.fields)) continue;

        if (!(await runAutomationAction(rule, ev))) continue;
        await db.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } });
      } catch (err) {
        reportError("automations.rule", err, { ruleId: rule.id, trigger: event.type });
      }
    }
  } catch (err) {
    reportError("automations.run", err, { trigger: event.type });
  }
}
