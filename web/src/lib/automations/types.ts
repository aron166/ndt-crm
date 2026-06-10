// Shared types for the task-automation rule engine.
//
// A rule is "when <trigger> [and <conditions>] → <action>". v1 ships the
// event-driven triggers (lead/deal lifecycle) + the time-based deal-idle one,
// and a single action: create a task. Conditions are optional, AND-ed.

export const TRIGGER_TYPES = [
  "lead_created",
  "lead_status_changed",
  "deal_stage_changed",
  "deal_idle_in_stage",
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const ACTION_TYPES = ["create_task", "send_email"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const CONDITION_OPS = [
  "eq",
  "ne",
  "gt",
  "lt",
  "contains",
  "is_empty",
  "is_not_empty",
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export interface Condition {
  field: string;
  op: ConditionOp;
  value?: string | number | null;
}

export interface TriggerConfig {
  /** lead_status_changed: only fire when the lead enters this status. */
  toStatus?: string;
  /** deal_stage_changed: only fire when the deal enters this stage. */
  toStageId?: number;
  /** deal_idle_in_stage: the stage to watch (optional — any stage if unset). */
  stageId?: number;
  /** deal_idle_in_stage: fire once a deal has sat this many days. */
  idleDays?: number;
}

export interface CreateTaskActionConfig {
  /** Task title; supports {company}/{message}/{sourceApp} placeholders. */
  titleTemplate: string;
  type?: string; // call, email, meeting, document, field_visit, internal
  category?: string; // revenue_generating | non_revenue
  dueInDays?: number;
  descriptionTemplate?: string;
  assignedToId?: number;
}

export interface SendEmailActionConfig {
  /** Email subject; supports {company}/{message}/… placeholders. */
  subjectTemplate: string;
  /** Email body (plain text; newlines preserved); same placeholders. */
  bodyTemplate: string;
}

/**
 * The runtime context an event carries to the engine. `fields` is the flat bag
 * the condition evaluator and template renderer read from; the entity ids are
 * what the created task is attached to.
 */
export interface AutomationEvent {
  type: TriggerType;
  tenantId: number;
  companyId: number | null;
  personId: number | null;
  dealId?: number | null;
  companyName?: string | null;
  /** lead_status_changed: the status the lead just entered. */
  toStatus?: string;
  /** deal_stage_changed: the stage the deal just entered. */
  toStageId?: number;
  fields: Record<string, string | number | null | undefined>;
}
