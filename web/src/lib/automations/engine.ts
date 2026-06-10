import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import type {
  AutomationEvent,
  Condition,
  ConditionOp,
  CreateTaskActionConfig,
  SendEmailActionConfig,
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

// ── Orchestrator (DB-backed) ────────────────────────────────────────

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
    for (const rule of rules) {
      // Per-rule isolation: one rule failing must not stop the others.
      try {
        if (!triggerMatches(rule.triggerType as TriggerType, rule.triggerConfig, event)) continue;
        if (!conditionsPass(rule.conditions, event.fields)) continue;

        if (rule.actionType === "create_task") {
          const cfg = rule.actionConfig as unknown as CreateTaskActionConfig;
          if (!cfg?.titleTemplate) continue;
          await db.task.create({ data: buildCreateTaskData(cfg, event) });
        } else if (rule.actionType === "send_email") {
          const cfg = rule.actionConfig as unknown as SendEmailActionConfig;
          if (!cfg?.subjectTemplate || !cfg?.bodyTemplate) continue;
          const to = await resolveRecipientEmail(event);
          if (!to) continue; // no address on file — skip (not an error)
          // Dynamic import keeps the server-only Resend module out of the unit-test
          // import graph for this otherwise-pure engine module.
          const { sendEmail } = await import("@/lib/integrations/resend");
          const result = await sendEmail({
            to,
            subject: renderTemplate(cfg.subjectTemplate, event),
            text: renderTemplate(cfg.bodyTemplate, event, false),
            companyId: event.companyId,
            personId: event.personId,
          });
          if (!result.ok) {
            reportError("automations.send_email", new Error(result.error), { ruleId: rule.id, trigger: event.type });
            continue;
          }
        } else {
          continue;
        }
        await db.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } });
      } catch (err) {
        reportError("automations.rule", err, { ruleId: rule.id, trigger: event.type });
      }
    }
  } catch (err) {
    reportError("automations.run", err, { trigger: event.type });
  }
}
